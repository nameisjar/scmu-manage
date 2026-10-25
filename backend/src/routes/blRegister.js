const router = require('express').Router();
const prisma = require('../prisma');
const {authenticate,authorize} = require('../middleware/auth');
const {STAFF,route,transaction,text} = require('../services/jpt');
const register = require('../services/blRegister');
router.use(authenticate,authorize(...STAFF));
router.get('/',route(async(req,res)=>res.json(await transaction(tx=>register.list(tx,req.query)))));
router.get('/:id',route(async(req,res)=>res.json(register.present(await register.get(prisma,req.params.id)))));
router.post('/',route(async(req,res)=>{
 text(req.body.billNumber,'BL number',100);register.normalize(req.body);
 res.status(201).json(await transaction(tx=>register.create(tx,req.user,req.body)));
}));
router.put('/:id',route(async(req,res)=>res.json(await transaction(tx=>register.update(tx,req.user,req.params.id,req.body)))));
router.post('/:id/estimate',route(async(req,res)=>res.json(await transaction(tx=>register.estimate(tx,req.params.id,req.body)))));
router.post('/:id/charges',route(async(req,res)=>res.status(201).json(await transaction(tx=>register.charges(tx,req.user,req.params.id,req.body)))));
module.exports=router;
