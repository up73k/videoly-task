function runInPromise(fn, args = [], ctx = fn) {
  return new Promise((resolve, reject) => {
    if (!fn) {
      resolve(null);
      return;
    }

    args.push((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });

    fn.apply(ctx, args);
  });
}

function randomStr(length) {
  let result = '';
  if (!length) length = 5 + Math.floor(Math.random() * 10);

  while (result.length < length) {
    result += Math.random().toString(36).slice(2);
  }

  return result.substr(0, length);
}

function randomInt(min = 0, max = 1000) {
  return Math.round(Math.random() * (max - min) + min);
}

const sets = new Map();
function getFromSet(set, setName) {
  if (!sets.has(setName)) {
    sets.set(setName, [...set]);
  }

  return sets.get(setName)[randomInt(0, set.size - 1)];
}

module.exports = {
  getFromSet,
  randomInt,
  randomStr,
  runInPromise
};
