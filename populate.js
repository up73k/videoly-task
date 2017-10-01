const _ = require('lodash');
const co = require('co');
const URI = require('urijs');
const debug = require('debug');
const pgtools = require('pgtools');
const moment = require('moment');
const { Pool } = require('pg');
const { Readable } = require('stream');
const { from: copyFrom } = require('pg-copy-streams');
const { postgres } = require('./config.json');
const { queries, counters, hosts, schemas, timeRange, browsers } = require('./populate.json');
const { runInPromise, randomInt, randomStr, getFromSet } = require('./helpers');

const pool = new Pool(postgres);

(() => {
  const log = debug('vtask::main');
  co(function* () {
    yield createDb(postgres);
    log(`Db ${postgres.database} created`);

    const client = yield pool.connect();
    log('Client connected');

    yield createTables(client);
    log('Tables created');

    console.time('fillTables');
    yield fillTables(client);
    console.timeEnd('fillTables');
    log('Tables filled');

    client.release();
    process.exit(0);
  }).catch((err) => {
    log(`Error happend: ${err.code || err.status || err.statusCode || ''} ${err.message || err.nativeMessage}`);
    log(`Stack: ${err.stack}`);
    process.exit(1);
  });
})();


function* createDb({ user, host, database }) {
  const log = debug('vtask::createDb');

  try {
    yield runInPromise(pgtools.dropdb, [{ user, host }, database]);
  } catch (err) {
    log(`Skip dropping db ${database} by reason: 
    ${err.code || err.status || err.statusCode} ${err.message || err.nativeMessage}`);
  }

  return yield runInPromise(pgtools.createdb, [{ user, host }, database]);
}

function* createTables(client) {
  return yield [queries.createA, queries.createB, queries.createIndex].map((q) => client.query(q));
}

function fillTables(client) {
  const log = debug('vtask::fillTables');

  const [streamA, streamB] = [queries.copyA, queries.copyB].map((q) => client.query(copyFrom(q)));
  log('COPY tables started.');

  const impressionsFirstClick = [];
  const impressionsOtherClicks = [];
  const impressionsUnclicked = [];

  const rowA = () => {
    const productSet = new Set();
    const visitorSet = new Set();
    let impressionsCounter = 0;

    return function A() {
      const timestamp = randomInt(timeRange.start, timeRange.stop);
      if (impressionsCounter < counters.impressions && Math.random() >= 0.49) {
        impressionsCounter++;
        impressionsFirstClick.push([A.counter, timestamp]);
        impressionsOtherClicks.push(..._.times(randomInt(0, 5), () => [A.counter, timestamp]));
      } else {
        impressionsUnclicked.push([A.counter, timestamp]);
      }

      const time = moment(timestamp).format('YYYY-MM-DDTHH:mm:ss');

      const product_id = productSet.size < counters.product
        ? randomInt(1, 99999999)
        : getFromSet(productSet, 'product');
      productSet.add(product_id);

      const visitor_id = visitorSet.size < counters.visitor
        ? randomInt(1, 99999999)
        : getFromSet(visitorSet, 'visitor');
      visitorSet.add(visitor_id);

      const browser = _.sample(browsers);

      const urlParams = {
        protocol: _.sample(schemas),
        hostname: _.sample(hosts),
        path: _.times(randomInt(0, 5), () => `/${randomStr(5)}`).join('') || undefined,
        query: _.times(randomInt(0, 3), () => `${randomStr(5)}=${randomStr(5)}`).join('&') || undefined,
      };

      const url = new URI(urlParams).toString();

      return `${time}\t${product_id}\t${visitor_id}\t${browser}\t${url}\n`;
    };
  };

  const rowB = () => {
    return function B() {
      let imp;

      if (impressionsFirstClick.length > 0) {
        imp = impressionsFirstClick.pop();
      } else {
        imp = impressionsOtherClicks.pop() || impressionsUnclicked.pop();
      }

      const [impression_id, timestamp] = imp;
      const local_time = moment(timestamp + randomInt(250, 250000)).format('YYYY-MM-DDTHH:mm:ss');

      return `${impression_id}\t${randomInt(0, 99999999)}\t${local_time}\n`;
    };
  };

  const makeReadFn = (stream, name, rowFn) => {
    rowFn.counter = 0;

    return () => {
      if (++rowFn.counter === counters.rows + 1) {
        stream.push(null);
      } else {
        stream.push(rowFn());
        // log('Read %s %d', name, rowFn.counter);
      }
    };
  };
  const [generateA, generateB] = [new Readable(), new Readable()];

  generateA._read = makeReadFn(generateA, 'A', rowA());
  generateB._read = makeReadFn(generateB, 'B', rowB());

  return new Promise((resolve, reject) => {
    const done = () => {
      log('All streams closed.');
      resolve();
    };

    streamA.on('error', reject);
    streamA.on('end', () => {
      log('Stream A closed');
      generateB.pipe(streamB);
    });

    streamB.on('error', reject);
    streamB.on('end', () => {
      log('Stream B closed');
      done();
    });

    generateA.on('error', reject);
    generateB.on('error', reject);

    generateA.pipe(streamA);
  });
}
