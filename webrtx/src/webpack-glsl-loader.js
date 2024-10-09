'use strict';

var fs = require('fs');
var path = require('path');


function parse(loader, source, context, state, cb) {
  var imports = [];
  var importPattern = /#include "([.\/\w_-]+)"/gi;
  var match = importPattern.exec(source);

  while (match != null) {
    imports.push({
      key: match[1],
      target: match[0],
      content: ''
    });
    match = importPattern.exec(source);
  }

  imports.reverse();
  processImports(loader, source, context, imports, state, cb);
}

function processImports(loader, source, context, imports, state, cb) {
  if (imports.length === 0) {
    return cb(null, source);
  }

  var imp = imports.pop();

  loader.resolve(context, './' + imp.key, function (err, resolved) {
    if (err) {
      return cb(err);
    }

    if (state.visited.has(resolved)) {
      source = source.replace(imp.target, '');
      processImports(loader, source, context, imports, state, cb);
      return;
    }

    loader.addDependency(resolved);
    fs.readFile(resolved, 'utf-8', function (err, src) {
      if (err) {
        return cb(err);
      }

      state.visited.add(resolved);
      parse(loader, src, path.dirname(resolved), state, function (err, bld) {
        if (err) {
          return cb(err);
        }

        source = source.replace(imp.target, bld);
        processImports(loader, source, context, imports, state, cb);
      });
    });
  });
}

// TODO: ignore #include in comments
module.exports = function (source) {
  this.cacheable();
  var cb = this.async();
  const state = {
    visited: new Set(),
    recStack: new Set(), // TODO: detect cycle
  };
  const opts = this.getOptions();
  const omitModuleExports = opts && opts.omitModuleExports;
  // TODO: get path of input source file
  parse(this, source, this.context, state, function (err, bld) {
    if (err) {
      return cb(err);
    }

    cb(null, (omitModuleExports ? bld : ('module.exports = ' + JSON.stringify(bld))));
  });
};