const config = {
  port: process.env.PORT || 2000,
  wsSecret: process.env.WS_SECRET || 'xinfin_xdpos_hybrid_network_stats',
  adminSecret: process.env.ADMIN_SECRET || '',
  logger: {
    verbosity: process.env.VERBOSITY? parseInt(process.env.VERBOSITY) : 1
  },
  mongodbForensicsCollection: {
    url: `mongodb://${process.env.MONGODBURL || 'localhost:27017'}/forensics`
  },
  enableForensics: process.env.ENABLE_FORENSICS == 'true' ? true: false,
  masternodeUrl: process.env.MASTERNODE_URL || "https://master.xinfin.network/api",
};

module.exports = {config}