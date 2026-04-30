const { items } = require('@wix/data');
const { auth } = require('@wix/essentials');

// @wix/data does not support suppressAuth currently, so we need to elevate it.
// Elevation is deferred (called per-invocation) because @wix/data's `items.*`
// methods are not guaranteed to be populated at module-load time in the Velo
// cloud runtime — accessing them eagerly throws "Cannot read properties of
// undefined (reading 'insert')" while loading the module.
const elevated =
  method =>
  (...args) =>
    auth.elevate(items[method])(...args);

const wixData = {
  insert: elevated('insert'),
  update: elevated('update'),
  bulkInsert: elevated('bulkInsert'),
  query: elevated('query'),
  save: elevated('save'),
  remove: elevated('remove'),
  get: elevated('get'),
  truncate: elevated('truncate'),
  bulkSave: elevated('bulkSave'),
  search: elevated('search'),
  //TODO: add other methods here as needed
};
module.exports = { wixData };
