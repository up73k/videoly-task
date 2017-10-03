module.exports = function (sequelize, DataTypes) {
  return sequelize.define('AtcClick', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    impression_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'pageviews',
        key: 'id'
      }
    },
    click_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    local_time: {
      type: DataTypes.TIME,
      allowNull: true
    }
  }, {
    tableName: 'atc_clicks',
    classMethods: {
      associate: (Pageview) => {
        this.belongsTo(Pageview, {
          as: 'view', foreignKey: 'addressId'
        });
      }
    }
  });
};
