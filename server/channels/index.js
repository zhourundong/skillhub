const LocalChannel = require('./local');
const RemoteChannel = require('./remote');

/**
 * 渠道注册表 - 新增渠道只需在此注册
 * key: 渠道 type 标识
 * value: 渠道实现类
 */
const channelRegistry = {
  local: LocalChannel,
  remote: RemoteChannel,
};

function createChannel(type, config) {
  const ChannelClass = channelRegistry[type];
  if (!ChannelClass) {
    throw new Error(`未知的发布渠道类型: ${type}`);
  }
  return new ChannelClass(typeof config === 'string' ? JSON.parse(config) : config);
}

function getRegisteredTypes() {
  return Object.keys(channelRegistry);
}

module.exports = { createChannel, getRegisteredTypes, channelRegistry };
