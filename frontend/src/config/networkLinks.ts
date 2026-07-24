export interface NavLink {
  label: string;
  href: string;
  active?: boolean;
}

export interface NetworkLinksConfig {
  navLinks: NavLink[];
  moreLinks: NavLink[];
  switchLink: NavLink;
}

// Apothem testnet — also used for local/devnet development.
const TESTNET_LINKS: NetworkLinksConfig = {
  navLinks: [
    { label: 'Network Stats', href: '/', active: true },
    { label: 'Masternode', href: 'https://master.apothem.network/' },
    { label: 'Block Explorer', href: 'https://explorer.apothem.network/' },
    { label: 'Web Wallet', href: 'https://wallet.apothem.network/' },
    { label: 'XinPay', href: 'https://chrome.google.com/webstore/detail/xinpay/bocpokimicclpaiekenaeelehdjllofo?hl=en' },
    { label: 'Get Test XDC', href: 'https://faucet.apothem.network/' },
    { label: 'Android Wallet', href: 'https://play.google.com/store/apps/details?id=com.xdcwallet' },
  ],
  moreLinks: [
    { label: 'One Click Installer', href: 'https://xinfin.org/setup-masternode' },
    { label: 'XinFin Docs', href: 'https://howto.xinfin.org/' },
    { label: 'XinFin API', href: 'https://apidocs.xinfin.network/docs/#xinfin-apis' },
    { label: 'XinFin API Docs', href: 'https://apidocs.xinfin.network/' },
  ],
  switchLink: { label: 'Switch to XinFin.Network', href: 'https://www.xinfin.network/' },
};

// XinFin mainnet — sourced from https://www.xinfin.network/#stats
const MAINNET_LINKS: NetworkLinksConfig = {
  navLinks: [
    { label: 'Network Stats', href: '/', active: true },
    { label: 'Masternode', href: 'https://master.xinfin.network/' },
    { label: 'Block Explorer', href: 'https://explorer.xinfin.network/' },
    { label: 'Web Wallet', href: 'https://wallet.xinfin.network/' },
    { label: 'XDCPay', href: 'https://chrome.google.com/webstore/detail/xdcpay/bocpokimicclpaiekenaeelehdjllofo?hl=en' },
  ],
  moreLinks: [
    { label: 'One Click Installer', href: 'https://xinfin.org/setup-masternode' },
    { label: 'XinFin Docs', href: 'https://howto.xinfin.org/' },
    { label: 'XinFin API', href: 'https://apidocs.xinfin.network/docs/#xinfin-apis' },
    { label: 'XinFin API Docs', href: 'https://apidocs.xinfin.network/' },
  ],
  switchLink: { label: 'Switch to Apothem.Network', href: 'https://www.apothem.network/' },
};

const CONFIGS_BY_MODE: Record<string, NetworkLinksConfig> = {
  mainnet: MAINNET_LINKS,
  testnet: TESTNET_LINKS,
  devnet: TESTNET_LINKS,
};

export function getNetworkLinks(mode: string): NetworkLinksConfig {
  return CONFIGS_BY_MODE[mode] ?? TESTNET_LINKS;
}
