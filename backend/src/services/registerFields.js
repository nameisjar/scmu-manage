const {fail, text, integer} = require('./jpt');
const AMOUNT_MEANING = 'UNCONFIRMED';
const {Prisma} = require('@prisma/client');
const optionalText = (value, name, max = 200) => text(typeof value === 'string' ? value.trim() : value, name, max, true);

function calendarDate(value, name = 'Date') {
  if (value == null || typeof value === 'string' && !value.trim()) return null;
  fail(typeof value === 'string', `${name} must be a valid date`);
  const source = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(source);
  fail(match, `${name} must be a valid date`);
  const calendar = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  fail(Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0,10) === source.slice(0,10), `${name} must be a valid date`);
  const result = new Date(source);
  fail(Number.isFinite(result.getTime()), `${name} must be a valid date`);
  return result.toISOString();
}

function normalizeFields(input) {
  const result = {...input};
  delete result.customerName;
  delete result.billingPartyName;
  for (const key of ['cargoDescription','partyName','partyText','reference1','reference2','additionalNotes']) {
    result[key] = optionalText(input[key],key,['cargoDescription','additionalNotes'].includes(key) ? 2000 : 200);
  }
  for (const key of ['quantity20','quantity21','quantity40']) {
    const value = input[key];
    fail(value == null || typeof value === 'string' || typeof value === 'number', `${key} must be a nonnegative integer`);
    result[key] = value == null || typeof value === 'string' && !value.trim() ? null : integer(value,key,0,2147483647);
  }
  // These manual book counts are independent of container detail rows.
  for (const key of ['departureDate','arrivalDate','additionalDate1','additionalDate2']) result[key] = calendarDate(input[key],key);
  result.documentPolicy = input.documentPolicy == null || input.documentPolicy === '' ? 'BL_ONLY' : require('./jpt').choice(input.documentPolicy,['BL_ONLY','BL_AND_PACKING'],'Document policy');
  result.includeInPackingHeader = input.includeInPackingHeader == null ? true : Boolean(input.includeInPackingHeader);
  result.billingStatus = input.billingStatus == null || input.billingStatus === '' ? 'NOT_RECEIVED' : require('./jpt').choice(input.billingStatus,['NOT_RECEIVED','RECEIVED','VERIFIED','APPROVED','PAID'],'Billing status');
  result.pph23Applicable = Boolean(input.pph23Applicable);
  result.amountMeaning = AMOUNT_MEANING;
  return result;
}
function registerAmount(value) {
  if (value == null || typeof value === 'string' && !value.trim()) return null;
  fail(typeof value === 'string' && /^-?\d+(?:\.\d{1,2})?$/.test(value.trim()), 'Register amount must be a decimal string with at most two decimal places');
  const result = new Prisma.Decimal(value.trim());
  fail(result.abs().lte('9999999999999999.99'), 'Register amount exceeds Decimal(18,2)');
  return result;
}
module.exports = {normalizeFields, optionalText, calendarDate, registerAmount, AMOUNT_MEANING};
