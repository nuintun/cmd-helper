/*
 * css
 * https://github.com/spmjs/spm2/issues/4
 *
 * Hsiaoming Yang <me@lepture.com>
 * Nuintun <nuintun@qq.com>
 */
var trimRE = /^(\r\n|\r|\n)|(\r\n|\r|\n)$/g,
  endblockRE = /^\/\*!\s*endblock(?:\s*|\s+(.+?)\s*)\*\/$/,
  importRE = /^@import\s+url\s*\((['"]?)(.+?)\1\);?$|^@import\s+(['"])(.+?)\3;?$/,
  tokensRE = /(\/\*[^*]*\*+([^/*][^*]*\*+)*\/)|(@import\s+url\s*\(.+?\);?|@import\s+(['"]).+?\4;?)|(([\S\s](?!@import\s|\/\*))+([\S\s](?=@import\s|\/\*))*)|(([\S\s](?!@import\s|\/\*))*([\S\s](?=@import\s|\/\*))+)/g;

// is function
function isFuncrion(fn){
  return typeof fn === 'function';
}

// is string
function isString(str){
  return typeof str === 'string';
}

/*
 * parse code into a tree
 */
function parse(code){
  var rules;

  if (!isString(code)) return [];

  rules = code.match(tokensRE);

  if (rules === null) return [];

  return parseBlock(rules);
}
exports.parse = parse;

function match(text, key){
  // /*! key value */
  var re = new RegExp('^\\/\\*!\\s*' + key + '\\s+(.+?)\\s*\\*\\/$'),
    m = text.match(re);

  if (!m) return;

  return m[1];
}

/*
 * recursive parse a block type code
 */
function parseBlock(rules){
  var tree,
    node = {
      id: null,
      type: 'block',
      code: []
    },
    blockDepth = [];

  /*
   * recursive parse a block code string
   */
  function parseString(rule, blockNode){
    var childNode = blockNode.code[blockNode.code.length - 1];

    if (childNode && childNode.type === 'string') {
      childNode.code += rule;
    } else {
      blockNode.code.push({
        type: 'string',
        code: rule
      });
    }
  }

  // parse block
  function parseInBlock(rule){
    var id, blockNode, start,
      end, imports, childNode;

    blockNode = blockDepth[blockDepth.length - 1] || node;

    if (rule.substr(0, 3) === '/*!') {
      /*! start block id */
      if (start = match(rule, 'block')) {
        childNode = {
          id: start,
          type: 'block',
          code: []
        };

        blockDepth.push(childNode);
        blockNode.code.push(childNode);
        return;
      }

      /*! endblock id */
      if (end = rule.match(endblockRE)) {
        if (!blockDepth.length) {
          throw new SyntaxError('block indent error.');
        }

        id = end[1];

        // endblock tag closed error
        if (id && (id !== blockNode.id)) {
          blockDepth = [];
          throw new SyntaxError('block indent error.');
        }

        blockDepth.pop();
        return;
      }

      if (imports = match(rule, 'import')) {
        childNode = {
          id: imports,
          type: 'import'
        };

        blockNode.code.push(childNode);
        return;
      }

      if (!node.id && (id = match(rule, 'define'))) {
        node.id = id;
        return;
      }
    }

    if (rule.substr(0, 8) === '@import ') {
      if (id = rule.match(importRE)) {
        if (id = id[2] || id[4]) {
          childNode = {
            id: id,
            type: 'import'
          };

          node.code.push(childNode);
          return;
        }
      }
    }

    parseString(rule, blockNode);
  }

  // parse syntax tree, notes: for loop faster than forEach
  for (var i = 0, len = rules.length; i < len; i++) {
    parseInBlock(rules[i]);
  }

  // lost endblock tag
  if (blockDepth.length) {
    blockDepth = [];
    throw new SyntaxError('block not finished.');
  }

  !node.id && delete node.id;

  tree = [node];

  return tree;
}

/*
 * Walk through the code tree
 */
exports.walk = function (code, fn){
  if (!Array.isArray(code)) {
    code = parse(code);
  }

  fn = isFuncrion(fn) ? fn : function (){};

  function walk(code){
    var node;

    // if fn return false, it will stop the walk
    if (Array.isArray(code)) {
      for (var i = 0, len = code.length; i < len; i++) {
        node = code[i];

        if (fn(node) !== false && node.type === 'block'
          && Array.isArray(node.code)) walk(node.code);
      }
    }
  }

  walk(code);
};

/*
 * print string of the parsed code
 */
exports.stringify = function (code, filter){
  var firstRun;

  if (!Array.isArray(code)) {
    return isString(code) ? code : '';
  }

  firstRun = true;
  filter = isFuncrion(filter) ? filter : false;

  function print(code, parent){
    var cursor = '';

    function walk(node){
      if (filter) {
        var ret = filter(node, parent);

        if (ret === false) return;

        if (ret && ret.type) {
          node = ret;
        }
      }

      switch (node.type) {
        case 'string':
          cursor += node.code;
          break;
        case 'import':
          cursor += '/*! import ' + node.id + ' */';
          break;
        case 'block':
          if (node.id) {
            cursor += '/*! block ' + node.id + ' */'
              + (firstRun
                ? '\n' + print(node.code, node).replace(trimRE, '') + '\n'
                : print(node.code, node))
              + '/*! endblock ' + node.id + ' */';
          } else {
            cursor = print(node.code, node);
          }
          break;
      }

      firstRun = false;
    }

    for (var i = 0, len = code.length; i < len; i++) {
      walk(code[i]);
    }

    return cursor;
  }

  return print(code);
};