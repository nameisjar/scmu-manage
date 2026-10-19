const { internalCompany } = require('../services/access');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { OPERATORS, CURRENCIES, choice, fail, date, number, transaction, mutableJob, syncJob, audit } = require('../services/jpt');

const { authenticate, authorize } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const {
  validate,
  createShipmentRules,
  trackingEventRules,
  paginationRules,
} = require('../middleware/validators');

const router = express.Router();
const prisma = require('../prisma');
const { transportFields } = require('../services/transport');

// ── File upload: validate MIME type, not just extension ───────────────────────
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const podsDirectory = path.resolve(__dirname, '../../uploads/pods');
fs.mkdirSync(podsDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: podsDirectory,
  filename: (req, file, cb) => {
    // Strip path components from original name to prevent directory traversal
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `pod-${randomUUID()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP and PDF files are allowed'), false);
    }
  },
});

function generateShipmentNumber() {
  return number('SHP');
}

// GET /api/shipments
router.get('/', authenticate, paginationRules, validate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { shipmentNumber: { contains: search, mode: 'insensitive' } },
          { originCity: { contains: search, mode: 'insensitive' } },
          { destCity: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where, skip, take: Number(limit),
        include: {
          shipper: { select: { id: true, name: true } },
          vehicle: { select: { id: true, registrationNo: true, type: true } },
          driver: { select: { id: true, name: true, phone: true } },
          goodsType: { select: { id: true, name: true } },
          _count: { select: { trackingEvents: true, pods: true } },
          job: { select: { id: true, jobNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.shipment.count({ where }),
    ]);

    res.json({ data: shipments, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// GET /api/shipments/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: req.params.id },
      include: {
        shipper: true, vehicle: true, driver: true, goodsType: true, route: true, job: { select: { id: true, jobNumber: true } }, carrier: true,
        trackingEvents: { orderBy: { recordedAt: 'desc' } },
        pods: true, invoice: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
    res.json(shipment);
  } catch (err) { next(err); }
});

// POST /api/shipments
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'ADMIN'),
  createShipmentRules,
  validate,
  async (req, res, next) => {
    try {
      // Whitelist accepted fields to prevent mass-assignment
      const {
        shipperCompanyId, vehicleId, driverId, goodsTypeId, routeId,
        originCity, originState, destCity, destState,
        loadingDate, expectedDelivery, freightAmount, weight,
        ewayBillNo, lrNumber, quantity, notes,
      } = req.body;

      const shipment = await transaction(async tx => tx.shipment.create({
        data: {
          shipperCompanyId: (await internalCompany(tx, shipperCompanyId)).id, ...(await transportFields(tx, req.body)),
          currency: choice(req.body.currency || 'IDR', CURRENCIES, 'Currency'),
          goodsTypeId: goodsTypeId || null, routeId: routeId || null,
          originCity, originState, destCity, destState,
          loadingDate: new Date(loadingDate),
          expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
          freightAmount: freightAmount ? Number(freightAmount) : null,
          weight: weight ? Number(weight) : null,
          quantity: quantity ? Number(quantity) : 1,
          ewayBillNo: ewayBillNo || null,
          lrNumber: lrNumber || null,
          notes,
          shipmentNumber: generateShipmentNumber(),
          createdById: req.user.id,
        },
      }));
      res.status(201).json(shipment);
    } catch (err) { next(err); }
  }
);

// POST /api/shipments/:id/tracking
router.post('/:id/tracking', authenticate, authorize(...OPERATORS), trackingEventRules, validate, async (req, res, next) => {
  try {
    const { eventType, location, city, state, latitude, longitude, notes } = req.body;

    // Verify shipment exists before writing tracking event
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id }, select: { id: true, jobId: true } });
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const recordedAt = date(req.body.recordedAt || new Date());
    const event = await transaction(async tx => {
    if (shipment.jobId) await mutableJob(tx, shipment.jobId);
    const createdEvent = await tx.trackingEvent.create({
      data: {
        shipmentId: req.params.id,
        eventType, location: location || city || 'En route', city: city || null, state: state || null,
        latitude: latitude != null ? Number(latitude) : null,
        longitude: longitude != null ? Number(longitude) : null,
        notes,
        recordedAt,
      },
    });

    const statusMap = {
      DEPARTED: 'IN_TRANSIT',
      PICKED_UP: 'IN_TRANSIT',
      IN_TRANSIT: 'IN_TRANSIT',
      DELIVERED: 'DELIVERED',
      REACHED_DESTINATION: 'REACHED_DESTINATION',
      REACHED_CHECKPOINT: 'IN_TRANSIT',
      RESUMED: 'IN_TRANSIT',
    };
    if (statusMap[eventType]) {
      await tx.shipment.update({
        where: { id: req.params.id },
        data: {
          status: statusMap[eventType],
          ...(eventType === 'DELIVERED' && { actualDelivery: recordedAt }),
        },
      });
    }
    await syncJob(tx, shipment.jobId);
    if (shipment.jobId) await audit(tx, req.user, 'TRACKING_UPDATED', 'JobOrder', shipment.jobId, { shipmentId: shipment.id, eventType });
    return createdEvent;
    });

    const io = req.app.get('io');
    if (io) io.to(`shipment_${req.params.id}`).emit('tracking_update', event);

    res.status(201).json(event);
  } catch (err) { next(err); }
});

// POST /api/shipments/:id/pod — Upload Proof of Delivery (authenticated, rate-limited)
router.post('/:id/pod', authenticate, authorize(...OPERATORS), uploadLimiter, async (req, res, next) => {
  const jobFiles = require('../services/jobFiles'); let copiedFilename;
  try {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
    fail(shipment, 'Shipment not found', 404);
    if (shipment.jobId) await mutableJob(prisma, shipment.jobId);
    await new Promise((resolve, reject) => upload.single('podImage')(req, res, error => error ? reject(error) : resolve()));
    await jobFiles.validateFile(req.file);
    const receivedAt = date(req.body.receivedAt || new Date());
    if (shipment.jobId) {
      copiedFilename = randomUUID() + path.extname(req.file.filename);
      await fs.promises.copyFile(req.file.path, jobFiles.filePath(copiedFilename));
    }
    const pod = await transaction(async tx => {
      if (shipment.jobId) await mutableJob(tx, shipment.jobId);
      const result = await tx.pOD.create({ data: { shipmentId: shipment.id, imageUrl: '/uploads/pods/' + req.file.filename,
        signedBy: req.body.signedBy || null, receivedAt, notes: req.body.notes || null } });
      await tx.shipment.update({ where: { id: shipment.id }, data: { status: 'POD_UPLOADED', actualDelivery: shipment.actualDelivery || receivedAt } });
      if (shipment.jobId) {
        const document = await tx.jobDocument.findFirst({ where: { jobId: shipment.jobId, type: 'POD', status: 'PENDING' } });
        const data = { filename: copiedFilename, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size, uploadedById: req.user.id, status: 'UPLOADED' };
        if (document) await tx.jobDocument.update({ where: { id: document.id }, data });
        else await tx.jobDocument.create({ data: { ...data, jobId: shipment.jobId, type: 'POD', title: 'Proof of delivery', shipmentId: shipment.id } });
        await syncJob(tx, shipment.jobId);
        await audit(tx, req.user, 'POD_UPLOADED', 'JobOrder', shipment.jobId, { shipmentId: shipment.id });
      }
      return result;
    });
    res.status(201).json(pod);
  } catch (error) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    if (copiedFilename) await jobFiles.removeFile(copiedFilename);
    next(error);
  }
});

// GET /api/shipments/:shipmentId/pod/:filename — Serve POD files (authenticated only)
router.get('/:shipmentId/pod/:filename', authenticate, async (req, res, next) => {
  try {
    const { filename } = req.params;
    // Prevent path traversal
    const safeFilename = path.basename(filename);
    const filePath = path.resolve(podsDirectory, safeFilename);

    // Verify the resolved path is inside the uploads directory
    const uploadsDir = podsDirectory;
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(400).json({ message: 'Invalid file path' });
    }

    // Verify the POD record belongs to this shipment
    const pod = await prisma.pOD.findFirst({
      where: { shipmentId: req.params.shipmentId, imageUrl: { endsWith: safeFilename } },
    });
    if (!pod) return res.status(404).json({ message: 'File not found' });

    res.sendFile(filePath);
  } catch (err) { next(err); }
});

// PUT /api/shipments/:id
router.put(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'ADMIN'),
  async (req, res, next) => {
    try {
      // Whitelist fields to prevent mass-assignment
      const {
        status, vehicleId, driverId, expectedDelivery, freightAmount, notes,
      } = req.body;

      const shipment = await transaction(async tx => {
      const current = await tx.shipment.findUnique({ where: { id: req.params.id } });
      fail(current, 'Shipment not found', 404);
      if (current.jobId) await mutableJob(tx, current.jobId);
      const changingTransport = ['transportSource', 'mode', 'carrierId', 'quoteId', 'vehicleId', 'driverId'].some(key => req.body[key] !== undefined);
      const assignment = changingTransport ? await transportFields(tx, { ...current, ...req.body }) : {};
      if (changingTransport && current.jobId) {
        const charges = await tx.jobCharge.findMany({ where: { shipmentId: current.id, kind: 'COST', status: { not: 'REJECTED' } } });
        fail(charges.every(charge => charge.costSource === (assignment.transportSource === 'INTERNAL' ? 'INTERNAL' : 'VENDOR') && (!charge.vendorId || charge.vendorId === assignment.carrierId)), 'Update linked costs before changing the transport source or vendor', 409);
      }
      if (status) choice(status, ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'REACHED_DESTINATION', 'DELIVERED', 'POD_UPLOADED', 'COMPLETED', 'CANCELLED']);
      const updated = await tx.shipment.update({
        where: { id: req.params.id },
        data: {
          ...(status !== undefined && { status }),
          ...assignment,
          ...(['DELIVERED', 'COMPLETED'].includes(status) && !current.actualDelivery && { actualDelivery: new Date() }),
          ...(expectedDelivery !== undefined && { expectedDelivery: new Date(expectedDelivery) }),
          ...(freightAmount !== undefined && { freightAmount: Number(freightAmount) }),
          ...(notes !== undefined && { notes }),
        },
      });
      await syncJob(tx, current.jobId);
      if (current.jobId) await audit(tx, req.user, 'SHIPMENT_UPDATED', 'JobOrder', current.jobId, { shipmentId: current.id, status });
      return updated;
      });
      res.json(shipment);
    } catch (err) { next(err); }
  }
);

module.exports = router;
