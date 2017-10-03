const co = require('co');
const debug = require('debug');
const URI = require('urijs');
const moment = require('moment');
const Sequelize = require('sequelize');
const cliParameters = require('cli-parameter-getter').get();
const { postgres } = require('./config.json');

(function main() {
  const log = debug('vtask::main');
  co(function* () {
    const sequelize = createSequelize(postgres);
    log('Sequelize instance started');
    // yield sequelize.authenticate();

    const models = modelsImport(sequelize);
    log('Pageview and Click models loaded');

    const { month = '', site = '' } = cliParameters;
    // log('Cli arguments are %o', cliParameters);
    if (!month || !site) {
      log('Parameter "month" or "site" not specified for command, executing stopped.');
      log('Please run as example "$ yarn fetch month=july site=shop1.com" !');
      process.exit(1);
    }

    const monthFilter = cliParameters.month.length === 3
      ? moment(cliParameters.month, 'MMM').format('M')
      : moment(cliParameters.month, 'MMMM').format('M');

    const siteFilter = URI(site).domain() || URI(`http://${site}`).domain();
    // log('domain %s', siteFilter);

    // console.time('Time spent on preparing conversion data');
    const conversions = yield findViews(sequelize, models, { monthFilter, siteFilter });
    log(`Conversions count for domain ${siteFilter} in ${moment(monthFilter, 'M').format('MMMM')} is ${conversions}`);
    // console.timeEnd('Time spent on preparing conversion data');

    process.exit(0);
  }).catch((err) => {
    log(`Error happend: ${err.code || err.status || err.statusCode || ''} ${err.message || err.nativeMessage || ''}`);
    log(`Stack: ${err.stack || ''}`);
    process.exit(1);
  });
}());

function createSequelize({ database, user, password, host }) {
  const { Op } = Sequelize;
  const operatorsAliases = {
    $eq: Op.eq,
    $ne: Op.ne,
    $gte: Op.gte,
    $gt: Op.gt,
    $lte: Op.lte,
    $lt: Op.lt,
    $not: Op.not,
    $in: Op.in,
    $notIn: Op.notIn,
    $is: Op.is,
    $like: Op.like,
    $notLike: Op.notLike,
    $iLike: Op.iLike,
    $notILike: Op.notILike,
    $regexp: Op.regexp,
    $notRegexp: Op.notRegexp,
    $iRegexp: Op.iRegexp,
    $notIRegexp: Op.notIRegexp,
    $between: Op.between,
    $notBetween: Op.notBetween,
    $overlap: Op.overlap,
    $contains: Op.contains,
    $contained: Op.contained,
    $adjacent: Op.adjacent,
    $strictLeft: Op.strictLeft,
    $strictRight: Op.strictRight,
    $noExtendRight: Op.noExtendRight,
    $noExtendLeft: Op.noExtendLeft,
    $and: Op.and,
    $or: Op.or,
    $any: Op.any,
    $all: Op.all,
    $values: Op.values,
    $col: Op.col
  };

  return new Sequelize(database, user, password, {
    host,
    dialect: 'postgres',
    pool: {
      max: 5,
      min: 0,
      idle: 10000
    },
    operatorsAliases,
    define: {
      timestamps: false,
      underscored: true
    }
  });
}

function modelsImport(sequelize) {
  const Pageview = sequelize.import('./models/pageviews.js');
  const Click = sequelize.import('./models/atc_clicks.js');
  Click.belongsTo(Pageview, { foreignKey: 'impression_id', targetKey: 'id' });

  return { Pageview, Click };
}

function* findViews(sequelize, { Pageview, Click }, { monthFilter, siteFilter }) {
  const [{ count: views }] = yield sequelize.query(
    `SELECT COUNT(DISTINCT p) FROM (SELECT EXTRACT(MONTH FROM time) as m, product_id as p, url as u FROM public.pageviews) t1 WHERE m = ${monthFilter} and u ~ '(${siteFilter})'`,
    { type: sequelize.QueryTypes.SELECT }
  );

  return JSON.parse(JSON.stringify(views));
}
