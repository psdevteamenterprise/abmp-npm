const { items } = require('@wix/data');
const { auth } = require('@wix/essentials');

// @wix/data does not support suppressAuth currently, so we need to elevate it
const wixData = {
  insert: auth.elevate(items.insert),
  update: auth.elevate(items.update),
  bulkInsert: auth.elevate(items.bulkInsert),
  query: auth.elevate(items.query),
  save: auth.elevate(items.save),
  remove: auth.elevate(items.remove),
  get: auth.elevate(items.get),
  //TODO: add other methods here as needed
};

module.exports = { wixData };
