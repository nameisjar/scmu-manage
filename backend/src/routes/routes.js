const express = require('express');

const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../prisma');
const { listPage } = require('../services/pagination');

router.get('/', authenticate, async (req, res, next) => {
  try {
    if(req.query.page||req.query.limit) {
      const where={isActive:true,...(req.query.search&&{OR:['name','originCity','destCity'].map(key=>({[key]:{contains:String(req.query.search).slice(0,200),mode:'insensitive'}}))})};
      return res.json(await listPage(prisma.route,{where,orderBy:[{name:'asc'},{id:'asc'}]},req.query));
    }
    const routes = await prisma.route.findMany({ where: { isActive: true }, orderBy: [{ name: 'asc' },{id:'asc'}] });
    res.json(routes);
  } catch (err) { next(err); }
});

router.post('/', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const route = await prisma.route.create({ data: req.body });
    res.status(201).json(route);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const route = await prisma.route.update({ where: { id: req.params.id }, data: req.body });
    res.json(route);
  } catch (err) { next(err); }
});

module.exports = router;
