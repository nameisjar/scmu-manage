const { fail, money } = require('./jpt');

function requireUnambiguousInvoiceTax(charges, tax) {
  // A single invoice-level tax has no line allocation/base. Never add it to
  // inclusive amounts (including mixed invoices), and never invent a tax base.
  fail(!money(tax).gt(0) || !charges.some(charge => charge?.tariffSnapshot?.line?.vatIncluded === true),
    'Additional tax cannot be applied to VAT-inclusive tariff charges; use zero tax. Mixed invoices require an explicit non-inclusive tax base and allocation.', 422);
}

module.exports = { requireUnambiguousInvoiceTax };
