const { get } = require("grunt");
const { config } = require("../../config");
const { getCollection } = require("../collection");

const getNodesCoinbase = async (req, res) => {
  if (!checkAuth(req)) {
    return sendPrettyJson(res, 401, {
      error: "Unauthorized",
      message: "Invalid or missing API secret",
    });
  }

  try {
    const Nodes = getCollection();
    const allNodes = Nodes.all();

    // Map nodes to only include name and coinbase
    const nodes = allNodes.map((node) => ({
      name: node.info?.name,
      coinbase: node.info?.coinbase,
    }));

    sendPrettyJson(res, 200, {
      count: nodes.length,
      nodes: nodes,
    });
  } catch (error) {
    console.error("Error in getNodesCoinbase:", error);
    sendPrettyJson(res, 500, {
      error: "Internal Server Error",
      message: "Failed to retrieve nodes coinbase addresses",
    });
  }
};

const getNodesInfo = async (req, res) => {
  if (!checkAuth(req)) {
    return sendPrettyJson(res, 401, {
      error: "Unauthorized",
      message: "Invalid or missing API secret",
    });
  }

  try {
    const Nodes = getCollection();
    const allNodes = Nodes.all();

    // Filter and map nodes to only include specific fields
    const filteredNodes = allNodes.map((node) => ({
      info: {
        name: node.info?.name,
        node: node.info?.node,
        coinbase: node.info?.coinbase,
        ip: node.info?.ip,
      },
      stats: {
        active: node.stats?.active,
        mining: node.stats?.mining,
        peers: node.stats?.peers,
        pending: node.stats?.pending,
      },
    }));

    sendPrettyJson(res, 200, {
      count: filteredNodes.length,
      nodes: filteredNodes,
    });
  } catch (error) {
    console.error("Error in getNodesInfo:", error);
    sendPrettyJson(res, 500, {
      error: "Internal Server Error",
      message: "Failed to retrieve nodes information",
    });
  }
};

const getNodesInfoVerbose = async (req, res) => {
  if (!checkAuth(req)) {
    return sendPrettyJson(res, 401, {
      error: "Unauthorized",
      message: "Invalid or missing API secret",
    });
  }

  try {
    const Nodes = getCollection();
    const allNodes = Nodes.all();

    sendPrettyJson(res, 200, {
      success: true,
      count: allNodes.length,
      nodes: allNodes,
    });
  } catch (error) {
    console.error("Error in getNodesInfoVerbose:", error);
    sendPrettyJson(res, 500, {
      error: "Internal Server Error",
      message: "Failed to retrieve nodes information",
    });
  }
};

const sendPrettyJson = (res, statusCode, data) => {
  res.set("Content-Type", "application/json");
  res.status(statusCode).send(JSON.stringify(data, null, 2));
};

const checkAuth = (req) => {
  const providedSecret = req.headers["x-api-secret"];
  if (
    !config.adminSecret ||
    !providedSecret ||
    providedSecret !== config.adminSecret
  ) {
    return false;
  }
  return true;
};

module.exports = { getNodesCoinbase, getNodesInfo, getNodesInfoVerbose };
