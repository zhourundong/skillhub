/**
 * 发布渠道基类 - 所有渠道需实现此接口
 */
class BaseChannel {
  constructor(config) {
    this.config = config;
  }

  /** 发布 skill 到该渠道 */
  async publish(skill) {
    throw new Error('publish() must be implemented');
  }

  /** 从该渠道下架 skill (参数为 skill 对象) */
  async unpublish(skill) {
    throw new Error('unpublish() must be implemented');
  }

  /** 检查渠道连接状态 */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented');
  }
}

module.exports = BaseChannel;
