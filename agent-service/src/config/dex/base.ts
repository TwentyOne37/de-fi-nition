export const BASE_DEX_ADDRESSES = {
  uniswapV3: {
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
    universalRouter: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  },
  aerodrome: {
    router: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
  },
  baseswap: {
    router: "0x802b65b5d9016621e66003aed0b16615093f328b",
  },
} as const;

export const getAllDexRouters = () => [
  BASE_DEX_ADDRESSES.uniswapV3.router.toLowerCase(),
  BASE_DEX_ADDRESSES.uniswapV3.swapRouter02.toLowerCase(),
  BASE_DEX_ADDRESSES.uniswapV3.universalRouter.toLowerCase(),
  BASE_DEX_ADDRESSES.aerodrome.router.toLowerCase(),
  BASE_DEX_ADDRESSES.baseswap.router.toLowerCase(),
];
