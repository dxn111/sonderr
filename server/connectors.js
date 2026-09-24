const CONNECTORS = {
  gmail: {
    id: "gmail",
    name: "Gmail",
    description: "Read and search email through a connected Gmail MCP server.",
    logo: "gmail",
    phrases: ["check my email", "check email", "my inbox", "gmail", "email inbox", "latest emails", "recent emails"]
  },
  notion: {
    id: "notion",
    name: "Notion",
    description: "Search and work with a connected Notion MCP server.",
    logo: "notion",
    phrases: ["notion", "my notes", "notion page", "notion workspace"]
  },
  slack: {
    id: "slack",
    name: "Slack",
    description: "Search and read messages through a connected Slack MCP server.",
    logo: "slack",
    phrases: ["slack", "slack messages", "team messages", "channel messages"]
  },
  google_drive: {
    id: "google-drive",
    name: "Google Drive",
    description: "Find and read files through a connected Google Drive MCP server.",
    logo: "google-drive",
    phrases: ["google drive", "my drive", "drive files", "drive document"]
  },
  github: {
    id: "github",
    name: "GitHub",
    description: "Inspect repositories, issues, and pull requests through a connected GitHub MCP server.",
    logo: "github",
    phrases: ["github", "github issue", "github repository", "pull request"]
  },
  linear: {
    id: "linear",
    name: "Linear",
    description: "Search and update issues through a connected Linear MCP server.",
    logo: "linear",
    phrases: ["linear", "linear issue", "linear project"]
  }
};

function list(mcp) {
  return Object.values(CONNECTORS).map(connector => {
    const server = mcp.listServers().find(item => item.id === connector.id || item.id.replace(/_/g, "-") === connector.id);
    return { ...connector, serverId: server?.id || connector.id, configured: Boolean(server), connected: Boolean(server?.connected), tools: server?.tools || [] };
  });
}

function requiredFor(text, mcp) {
  const value = String(text || "").toLowerCase();
  const connector = Object.values(CONNECTORS).find(item => item.phrases.some(phrase => value.includes(phrase)));
  if (!connector) return null;
  const server = mcp.listServers().find(item => item.id === connector.id || item.id.replace(/_/g, "-") === connector.id);
  if (server?.connected) return null;
  return {
    id: server?.id || connector.id,
    name: connector.name,
    description: connector.description,
    logo: connector.logo,
    configured: Boolean(server),
    title: "Connect " + connector.name,
    message: "I can check that once " + connector.name + " is connected. I won't pretend to access an account that isn't connected."
  };
}

module.exports = { CONNECTORS, list, requiredFor };
