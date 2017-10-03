module.exports = function (sequelize, DataTypes) {
  return sequelize.define('Pageview', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    visitor_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    browser_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'pageviews'
  });
};
