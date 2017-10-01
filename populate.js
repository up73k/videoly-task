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

(function main() {
  const log = debug('vtask::main');
  co(function* () {
    yield createDb(postgres);
    log(`Db ${postgres.database} created`);

    const client = yield pool.connect();
    log('Client connected');

    yield createTables(client);
    log('Tables created');

    console.time('Time spent on filling tables');
    yield fillTables(client);
    console.timeEnd('Time spent on filling tables');
    log('Tables filled');

    client.release();
    process.exit(0);
  }).catch((err) => {
    log(`Error happend: ${err.code || err.status || err.statusCode || ''} ${err.message || err.nativeMessage || ''}`);
    log(`Stack: ${err.stack || ''}`);
    process.exit(1);
  });
}());


function* createDb({ user, host, database }) {
  const log = debug('vtask::createDb');

  try {
    yield runInPromise(pgtools.dropdb, [{ user, host }, database]);
  } catch (err) {
    log(`Skip dropping db ${database} by reason: 
    ${err.code || err.status || err.statusCode || ''} ${err.message || err.nativeMessage || ''}`);
  }

  return yield runInPromise(pgtools.createdb, [{ user, host }, database]);
}

function* createTables(client) {
  return yield [queries.createA, queries.createB, queries.createIndex].map((q) => client.query(q));
}

function fillTables(client) {
  const log = debug('vtask::fillTables');

  const [firstClick, otherClicks, unclicked] = [[], [], []];

  const rowA = () => {
    const [productSet, visitorSet] = [new Set(), new Set()];
    let impressionsWithClicksCounter = 0;

    return function A() {
      const timestamp = randomInt(timeRange.start, timeRange.stop);
      if (impressionsWithClicksCounter < counters.impressions && Math.random() >= 0.5) {
        impressionsWithClicksCounter++;
        firstClick.push({ impression_id: A.counter, timestamp });
        otherClicks.push(..._.times(randomInt(0, 5), () => ({ impression_id: A.counter, timestamp })));
      } else {
        unclicked.push({ impression_id: A.counter, timestamp });
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

      if (firstClick.length > 0) {
        imp = firstClick.pop();
      } else {
        imp = otherClicks.pop() || unclicked.pop();
      }

      const { impression_id, timestamp } = imp;
      const local_time = moment(timestamp + randomInt(250, 250000)).format('YYYY-MM-DDTHH:mm:ss');
      const click_id = randomInt(0, 99999999);
      return `${impression_id}\t${click_id}\t${local_time}\n`;
    };
  };

  const [generateA, generateB] = [new Readable(), new Readable()];
  const [streamA, streamB] = [queries.copyA, queries.copyB].map((q) => client.query(copyFrom(q)));
  log('COPY tables started.');
  log('Process can take few minutes. Please wait awhile )');

  generateA._read = makeReadFn(generateA, 'A', rowA());
  generateB._read = makeReadFn(generateB, 'B', rowB());

  return new Promise((resolve, reject) => {
    const done = () => {
      log('All streams closed.');
      resolve();
    };

    streamA.on('error', reject);
    streamA.on('end', () => {
      log('Stream for Table A closed');
      generateB.pipe(streamB);
    });

    streamB.on('error', reject);
    streamB.on('end', () => {
      log('Stream for Table B closed');
      done();
    });

    generateA.on('error', reject);
    generateB.on('error', reject);

    generateA.pipe(streamA);
  });
}

function makeReadFn(stream, name, rowFn) {
  rowFn.counter = 0;

  return () => {
    if (++rowFn.counter === counters.rows + 1) {
      stream.push(null);
    } else {
      stream.push(rowFn());
      // log('Read %s %d', name, rowFn.counter);
    }
  };
}
