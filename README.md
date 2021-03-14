# Gremlose

Support for [Gremlin package][gremlin-npm]

## Installation
```bash
npm install gremlose
```

## Documentation

### Initialization

```javascript
const Gremlose = require('./gremlose');
const gremlose = new Gremlose(options);
```
#### Options

* `options`: Options object which takes the parameters create connection to `Gremlin Server`
  * `wsUrl`: Url Socket connect to Server, ex: `ws://localhost:8182/gremlin`
  * `host`: host of server, ex: `localhost`
  * `port`: port of server, ex: `8182`
  * `pathname`: pathname to server, ex: `gremlin`

#### Example
```javascript
const Gremlose = require('./gremlose');
const gremlose = new Gremlose({
  wsUrl: 'ws://localhost:8182/gremlin'
  // host: 'localhost',
  // port: '8182',
  // pathname: 'gremlin'
});
```

### Methods

##### createVertexModel(name), createEdgeModel(name)

create vertex/edge model, return a `Promise`
`name`: Label of Vertex/Edge use when create vertex by Model, vertex auto format with first letter is UpperCase, edge use snake_chain format.

##### example

```javascript
let Post = gremlose.createVertexModel('Post');
let User = gremlose.createVertexModel('User');
let Comment = gremlose.createVertexModel('Comment');

let PostedEdge = gremlose.createEdgeModel('posted');
let FollowingEdge = gremlose.createEdgeModel('following');

let postData = {
    "userId": 1,
    "id": 1,
    "title": "sunt aut facere repellat provident occaecati excepturi optio reprehenderit",
    "body": "quia et suscipit suscipit recusandae consequuntur expedita et cum reprehenderit molestiae ut ut quas totam nostrum rerum est autem sunt rem eveniet architecto"
}

await Post.createVertex(postData);
```

##### Get graph and client instance
```javascript
const g = gremlose.graphInstance;
const client = gremlose.clientInstance;
```

##### executeQuery(queryStr)
use query string insteal method of Gremlin
execute custom query by `traversalSource` is `g`
```javascript
await gremlose.executeQuery(`g.E('oe03n-sgo-27th-3bc')`);
```

[gremlin-npm]: https://www.npmjs.com/package/gremlin
