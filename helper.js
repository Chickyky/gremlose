const gremlin = require('gremlin');
const flatten = require('flat');
const _ = require('lodash');
const dotProp = require('dot-prop');
const dayjs = require('dayjs');

const { t: { id } } = gremlin.process;
const { cardinality: { single, list } } = gremlin.process;

function mapToObj(inputMap) {
  let obj = {};

  inputMap.forEach((value, key) => {
    obj[key] = value
  });

  return obj;
}

function edgesToJson(edgeList) {
  return edgeList.map(
    edge => ({
      id: typeof edge.get('id') !== 'string' ? JSON.stringify(edge.get('id')) : edge.get('id'),
      from: edge.get('from'),
      to: edge.get('to'),
      label: edge.get('label'),
      properties: mapToObj(edge.get('properties')),
    })
  );
}

function nodesToJson(nodeList) {
  return nodeList.map(
    node => ({
      id: node.get('id'),
      label: node.get('label'),
      properties: mapToObj(node.get('properties')),
      edges: edgesToJson(node.get('edges'))
    })
  );
}

function makeQuery(query, nodeLimit) {
  const nodeLimitQuery = !isNaN(nodeLimit) && Number(nodeLimit) > 0 ? `.limit(${nodeLimit})`: '';
  return `${query}${nodeLimitQuery}.dedup().as('node').project('id', 'label', 'properties', 'edges').by(__.id()).by(__.label()).by(__.valueMap().by(__.unfold())).by(__.outE().project('id', 'from', 'to', 'label', 'properties').by(__.id()).by(__.select('node').id()).by(__.inV().id()).by(__.label()).by(__.valueMap().by(__.unfold())).fold())`;
}

function stringifyValue(value) {
  if (typeof value === 'string') {
    return `'${value}'`;
  } else {
    return `${value}`;
  }
}

let addMeta = (_args, meta = {}) => {
  for (let key in meta) {
    let value = meta[key];

    if (typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
      || value instanceof Date
    ) {
      _args = [..._args, key, value];
    }
  }

  return _args;
}

module.exports = {
  addProps: (chain, props = {}, type = 'vertex', meta = {}) => {
    const _props = flatten(props, { safe: type === 'vertex' });

    for (let key in _props) {
      let propValue = _props[key];

      let _meta = dotProp.get(meta, key);
      _meta = _meta && typeof _meta === 'object' ? _meta : {};

      if (Array.isArray(propValue)) {
        propValue = propValue.map(p => p instanceof Date ? p.getTime() : p)

        if (type === 'vertex') {
          for (let i = 0; i < propValue.length; i++) {
            let _value = propValue[i];
            if (_value === undefined || _value === null || typeof _value === 'object') {
              _value = JSON.stringify(_value);
            }

            let _args = [list, key, _value];
            if (_meta && _meta[i]) _args = addMeta(_args, _meta[i]);

            chain = chain.property.apply(chain, _args);
          }
        } else {
          let _args = [key, JSON.stringify(propValue)];
          _args = addMeta(_args, _meta);

          chain = chain.property.apply(chain, _args);
        }
      } else {
        let _args = [];

        if (propValue === undefined || propValue === null) {
          propValue = JSON.stringify(propValue);
        }

        if (propValue instanceof Date) {
          propValue = propValue.getTime();
        }

        if (type === 'vertex') _args = [single];

        _args = [..._args, key, propValue];
        _args = addMeta(_args, _meta);

        chain = chain.property.apply(chain, _args);
      }
    }

    return chain;
  },

  parseJson: (str) => {
    if (!str) return str;

    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  },

  parseVertexFromQuery: (json) => {
    if (!json) return json;

    let _output = {
      id: json.id,
      label: json.label
    };

    let { properties } = json;
    let _meta = {};

    properties = properties || {};
    _output.properties = {};

    for (let key in properties) {
      const prop = properties[key];
      const isList = prop.length > 1;

      if (isList) { // list, array
        _output.properties[key] = [];
        _meta[key] = [];

        prop.map(p => {
          let { id, value } = p;
          value = module.exports.parseJson(value);

          if (typeof value === 'string' && dayjs(new Date(value)).isValid()) {
            value = dayjs(value).toDate();
          }

          _output.properties[key].push(value);

          let _metaInList = {
            _id: id,
            _key: key,
            _value: value,
            _type: 'list'
          };

          // properties in property
          if (p.properties) _metaInList = Object.assign({}, _metaInList, p.properties);

          _meta[key].push(_metaInList);

          return  p;
        });
      } else { // single, object
        const _prop = prop[0];
        let { id, value } = _prop;

        if (typeof value === 'string' && dayjs(new Date(value)).isValid()) {
          value = dayjs(value).toDate();
        }

        _output.properties[key] = value;
        _meta[key] = {
          _id: id,
          _key: key,
          _value: value,
          _type: 'single'
        };

        // properties in property
        if (_prop.properties) _meta[key] = Object.assign({}, _meta[key], _prop.properties);
      }
    }

    _output.properties = flatten.unflatten(_output.properties);
    _output._meta = flatten.unflatten(_meta);

    return _output;
  },

  parseEdgeFromQuery: (json) => {
    if (!json) return json;

    let _output = _.cloneDeep(json);
    _output.properties = flatten.unflatten(json.properties || {});

    for (let key in _output.properties) {
      _output.properties[key] = module.exports.parseJson(_output.properties[key]);
    }

    return _output;
  },

  mapToObj,
  edgesToJson,
  nodesToJson,
  makeQuery,

  stringifyValue
}