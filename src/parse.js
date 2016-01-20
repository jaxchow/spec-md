'use strict';

var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');
var grammar = require('./grammar');
var visit = require('./visit');


module.exports = parse;

function parse(filepath) {
  return importAST(grammar, filepath);
}

function readFile(filepath) {
  return new Promise(function (resolve, reject) {
    fs.readFile(filepath, { encoding: 'utf8' }, function (err, result) {

      return err ? reject(err) : resolve(result);
    });
  });
}

function importAST(parser, filepath,node) {
  return readFile(filepath).then(function (source) {
    try {
      var exname=/\.[^\.]+$/.exec(filepath)
      if(exname[0]!=='.md'){
        if( node.contents[0].value !='example'){
          source='\n\r```'+exname[0].replace(".","!")+'\n\r'+source+'\n\r```\n\r'
        }
      }
      var ast = parser.parse(source);
    } catch (error) {
      error.message =
        filepath + ':' + error.line + ':' + error.column + '\n' +
        source.split(/\r\n|\n|\r/g)[error.line - 1] + '\n' +
        Array(error.column).join(' ') + '^\n' +
        error.message;
      throw error;
    }
    var importASTs = [];
    visit(ast, function (node) {
      if (node.type === 'Import' || node.type === 'Include') {
        var subfilepath = path.resolve(path.dirname(filepath), node.path);
        importASTs.push(importAST(parser, subfilepath,node));
      }
    });
    return Promise.all(importASTs).then(function (asts) {
      var cursor = 0;
      var needToFlattenStack = [];
      var needToFlatten;
      return visit(ast, {
        leave: function (node, key, parent, keyPath) {
          if (needToFlatten !== undefined && keyPath.join('.') === needToFlatten) {
            node.contents = node.contents.reduce(flattener, []);
            needToFlatten = needToFlattenStack.pop();
          }
          if (node.type === 'Import' || node.type === 'Include') {
            var pathToFlatten = keyPath.slice(0, -1).join('.');
            if (pathToFlatten !== needToFlatten) {
              needToFlattenStack.push(needToFlatten);
              needToFlatten = pathToFlatten;
            }
            return asts[cursor++].contents;
          }
        }
      });
    });
  });
}

function flattener(array, item) {
  if (Array.isArray(item)) {
    return item.reduce(flattener, array);
  }
  array.push(item);
  return array;
}
