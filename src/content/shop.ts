// Справочник магазина: что продаём, почём, каких размеров и цветов, что лежит
// в коробке. Устроен как services.ts — ТЕКСТОВ здесь нет. Описания, плюсы и
// подписи живут в messages/<язык>.json (раздел ShopCatalog, ключ = id товара),
// потому что сайт говорит на семи языках.
//
// Откуда цифры (сентябрь 2026):
// • цены — «Прайс Lift розница.xlsx» от начальника, колонка U.S. Retail / US
//   MSRP. Это американская розница в долларах, итоговую цену во Вьетнаме
//   называем при связи. ⚠️ В том же файле есть колонка U.S. Wholesale — это
//   закупочная цена, на сайт она не попадает НИКОГДА;
// • комплектация, объём, вес и допустимый вес райдера — сайт liftfoils.com (он
//   совпадает с листом «комплектация» из прайса). Каталог 2026 местами
//   расходится с ними, и сам производитель пишет, что комплектация может
//   немного меняться, — отсюда сноска на странице товара;
// • фото — рендеры с liftfoils.com, лежат в public/media/shop/<id товара>/.
//
// Названия моделей, цветов и деталей не переводим: это фирменные имена, по
// ним человек потом ищет вещь у производителя и в чатах райдеров.

export type ShopCategory = "efoil" | "accessory";

// Линейка доски — по ней аксессуар «подходит к».
export type ShopLine = "LIFT5" | "LIFT5 F" | "LIFTX";

export interface ShopColor {
  id: string; // в имени файла фото: <размер>-<цвет>-<ракурс>.webp
  name: string; // фирменное название цвета, как у Lift
  hex: string; // кружок палитры (сняли с каталога)
}

// Что стоит на доске этого размера. Подписи строк («Мачта с мотором»,
// «Переднее крыло») — в messages, ShopProduct.setup.
export interface ShopSetup {
  mast: string;
  propeller: string;
  frontWing: string;
  backWing: string;
  battery: string;
  controller: string;
}

export interface ShopSize {
  id: string; // "4-9" — в имени файла фото
  label: string; // "4'9 Sport"
  priceUsd: number;
  volumeL: number;
  dimensionsCm: string; // длина × ширина × толщина доски
  setupKg: number; // весь комплект: доска, мачта, крылья, батарея
  maxRiderKg: number; // рекомендация Lift
  maxRiderBlowfishKg?: number; // то же с надувным Blowfish
  setup: ShopSetup;
}

export interface ShopEfoil {
  category: "efoil";
  id: string; // адрес /shop/<id>
  brand: string;
  name: string;
  line: ShopLine;
  rideMinutes: number; // среднее время на моторе с полной батареи
  limited?: boolean; // лимитированная серия
  colors: ShopColor[];
  sizes: ShopSize[];
  defaultSizeId: string; // что показываем первым — самый ходовой размер
}

export interface ShopAccessoryVariant {
  id: string;
  label?: string; // нет подписи — вариант у товара один
  priceUsd: number;
  images: string[];
}

export interface ShopAccessory {
  category: "accessory";
  id: string;
  brand: string;
  name: string;
  fits: ShopLine[]; // с какими досками работает
  variants: ShopAccessoryVariant[];
}

export type ShopProduct = ShopEfoil | ShopAccessory;

// Ракурсы рендера доски — в таком порядке они идут в галерее.
export const EFOIL_ANGLES = ["iso", "front", "ortho"] as const;

const C = {
  carbonBlack: { id: "carbon-black", name: "Carbon Black", hex: "#1f2022" },
  offWhite: { id: "off-white", name: "Off-White", hex: "#ece9e1" },
  steelBlue: { id: "steel-blue", name: "Steel Blue", hex: "#3f6d8c" },
  sunKissed: { id: "sun-kissed", name: "Sun Kissed", hex: "#e3b94c" },
  redRock: { id: "red-rock", name: "Red Rock", hex: "#b25c50" },
  tidePoolBlue: { id: "tide-pool-blue", name: "Tide Pool Blue", hex: "#4bbccc" },
  matchaGreen: { id: "matcha-green", name: "Matcha Green", hex: "#b2c27f" },
  sparkBlue: { id: "spark-blue", name: "Spark Blue", hex: "#44a7c4" },
  dawnPatrol: { id: "dawn-patrol", name: "Dawn Patrol", hex: "#e1603f" },
  blueJava: { id: "blue-java", name: "Blue Java", hex: "#2ca6c9" },
  carbonHexBlack: { id: "carbon-hex-black", name: "Carbon Hex Black", hex: "#141414" },
  florenceRed: { id: "florence-red", name: "Florence Red", hex: "#b1302a" },
} satisfies Record<string, ShopColor>;

// Общие детали комплектов — чтобы одна и та же строка не расходилась опечаткой.
const GEN5 = "Gen5 Full Range Battery";
const LIFTX_BATTERY = "LIFTX Battery";
const ELITE = "Elite Hand Controller";
const LIFT_HC = "Lift Hand Controller";
const MAST_68_32 = '32" LCS Carbon 68';
const MAST_55_LOW = '32" LCS Carbon 55 Low Mount';
const LIFTX_PROP = "LCS 55 Folding Glide";

export const shopEfoils: ShopEfoil[] = [
  {
    category: "efoil",
    id: "lift5-f",
    brand: "Lift Foils",
    name: "LIFT5 F",
    line: "LIFT5 F",
    rideMinutes: 90,
    colors: [C.tidePoolBlue, C.matchaGreen],
    defaultSizeId: "4-9",
    sizes: [
      {
        id: "4-9",
        label: "4'9 Sport",
        priceUsd: 10_999,
        volumeL: 67,
        dimensionsCm: "145 × 64 × 10",
        setupKg: 30.8,
        maxRiderKg: 100,
        maxRiderBlowfishKg: 129,
        setup: {
          mast: '28" LCS Aluminum 68',
          propeller: "Lift Jet",
          frontWing: "200 Surf V2",
          backWing: "38 Surf",
          battery: GEN5,
          controller: LIFT_HC,
        },
      },
      {
        id: "5-4",
        label: "5'4 Cruiser",
        priceUsd: 10_999,
        volumeL: 83,
        dimensionsCm: "163 × 70 × 10",
        setupKg: 32.2,
        maxRiderKg: 113,
        maxRiderBlowfishKg: 129,
        setup: {
          mast: '28" LCS Aluminum 68',
          propeller: "Lift Jet",
          frontWing: "200 Surf V2",
          backWing: "48 Surf",
          battery: GEN5,
          controller: LIFT_HC,
        },
      },
    ],
  },
  {
    category: "efoil",
    id: "lift5",
    brand: "Lift Foils",
    name: "LIFT5",
    line: "LIFT5",
    rideMinutes: 90,
    colors: [C.carbonBlack, C.offWhite, C.steelBlue, C.sunKissed, C.redRock],
    defaultSizeId: "4-9",
    sizes: [
      {
        id: "4-4",
        label: "4'4 Pro",
        priceUsd: 14_999,
        volumeL: 55,
        dimensionsCm: "132 × 57 × 10",
        setupKg: 29.5,
        maxRiderKg: 86,
        maxRiderBlowfishKg: 109,
        setup: {
          mast: MAST_68_32,
          propeller: "LCS Jet",
          frontWing: "210 Camber Pro LCS",
          backWing: "36 Glide",
          battery: GEN5,
          controller: ELITE,
        },
      },
      {
        id: "4-9",
        label: "4'9 Sport",
        priceUsd: 14_999,
        volumeL: 67,
        dimensionsCm: "145 × 64 × 10",
        setupKg: 30.6,
        maxRiderKg: 100,
        maxRiderBlowfishKg: 118,
        setup: {
          mast: MAST_68_32,
          propeller: "LCS Jet",
          frontWing: "210 Camber Pro LCS",
          backWing: "36 Glide",
          battery: GEN5,
          controller: ELITE,
        },
      },
      {
        id: "5-4",
        label: "5'4 Cruiser",
        priceUsd: 14_999,
        volumeL: 83,
        dimensionsCm: "163 × 70 × 10",
        setupKg: 32,
        maxRiderKg: 113,
        maxRiderBlowfishKg: 129,
        setup: {
          mast: '28" LCS Carbon 68',
          propeller: "LCS Jet",
          frontWing: "270 Camber Pro LCS",
          backWing: "46 Glide",
          battery: GEN5,
          controller: ELITE,
        },
      },
    ],
  },
  {
    category: "efoil",
    id: "liftx",
    brand: "Lift Foils",
    name: "LIFTX",
    line: "LIFTX",
    rideMinutes: 45,
    colors: [C.offWhite, C.sparkBlue, C.dawnPatrol],
    defaultSizeId: "4-8",
    sizes: [
      {
        id: "4-3",
        label: "4'3",
        priceUsd: 13_999,
        volumeL: 42,
        dimensionsCm: "130 × 48 × 10",
        setupKg: 20,
        maxRiderKg: 79,
        setup: {
          mast: MAST_55_LOW,
          propeller: LIFTX_PROP,
          frontWing: "150 Havoc LCS",
          backWing: "21 Flow",
          battery: LIFTX_BATTERY,
          controller: LIFT_HC,
        },
      },
      {
        id: "4-8",
        label: "4'8",
        priceUsd: 13_999,
        volumeL: 52,
        dimensionsCm: "142 × 53 × 10",
        setupKg: 20.5,
        maxRiderKg: 84,
        setup: {
          mast: MAST_55_LOW,
          propeller: LIFTX_PROP,
          frontWing: "150 Havoc LCS",
          backWing: "26 Flow",
          battery: LIFTX_BATTERY,
          controller: LIFT_HC,
        },
      },
      {
        id: "5-2",
        label: "5'2",
        priceUsd: 13_999,
        volumeL: 64,
        dimensionsCm: "157 × 58 × 10",
        setupKg: 21,
        maxRiderKg: 91,
        setup: {
          mast: MAST_55_LOW,
          propeller: LIFTX_PROP,
          frontWing: "200 Havoc LCS",
          backWing: "31 Flow",
          battery: LIFTX_BATTERY,
          controller: LIFT_HC,
        },
      },
      {
        id: "5-4",
        label: "5'4",
        priceUsd: 13_999,
        volumeL: 70,
        dimensionsCm: "163 × 62 × 10",
        setupKg: 21.5,
        maxRiderKg: 100,
        setup: {
          mast: MAST_55_LOW,
          propeller: LIFTX_PROP,
          frontWing: "200 Havoc LCS",
          backWing: "31 Flow",
          battery: LIFTX_BATTERY,
          controller: LIFT_HC,
        },
      },
    ],
  },
  {
    category: "efoil",
    id: "lift5-laird",
    brand: "Lift Foils",
    name: "LIFT5 × Laird",
    line: "LIFT5",
    rideMinutes: 90,
    limited: true,
    colors: [C.offWhite, C.blueJava, C.carbonHexBlack],
    defaultSizeId: "5-2",
    sizes: [
      {
        id: "5-2",
        label: "5'2 Laird",
        priceUsd: 15_499,
        volumeL: 64,
        dimensionsCm: "157 × 60 × 10",
        setupKg: 28.6,
        maxRiderKg: 100,
        setup: {
          mast: MAST_68_32,
          propeller: "LCS Jet",
          frontWing: "200 Havoc LCS",
          backWing: "26 Flow",
          battery: GEN5,
          controller: ELITE,
        },
      },
    ],
  },
  {
    category: "efoil",
    id: "liftx-florence",
    brand: "Lift Foils",
    name: "LIFTX × Florence",
    line: "LIFTX",
    rideMinutes: 45,
    limited: true,
    colors: [C.florenceRed, C.offWhite],
    defaultSizeId: "4-7",
    sizes: [
      {
        id: "4-7",
        label: "4'7 Florence",
        priceUsd: 14_749,
        volumeL: 49,
        dimensionsCm: "140 × 52 × 10",
        setupKg: 20.7,
        maxRiderKg: 82,
        setup: {
          mast: MAST_55_LOW,
          propeller: LIFTX_PROP,
          frontWing: "150 Vario LCS",
          backWing: "26 Flow",
          battery: LIFTX_BATTERY,
          controller: LIFT_HC,
        },
      },
    ],
  },
];

const img = (id: string, variant: string, count: number) =>
  Array.from({ length: count }, (_, n) => `/media/shop/${id}/${variant}-${n + 1}.webp`);

export const shopAccessories: ShopAccessory[] = [
  {
    category: "accessory",
    id: "gen5-battery",
    brand: "Lift Foils",
    name: "Gen5 Full Range Battery",
    fits: ["LIFT5", "LIFT5 F"],
    variants: [{ id: "main", priceUsd: 3_880, images: img("gen5-battery", "main", 3) }],
  },
  {
    category: "accessory",
    id: "liftx-battery",
    brand: "Lift Foils",
    name: "LIFTX Battery",
    fits: ["LIFTX", "LIFT5", "LIFT5 F"],
    variants: [{ id: "main", priceUsd: 3_200, images: img("liftx-battery", "main", 3) }],
  },
  {
    category: "accessory",
    id: "liftx-battery-adapter",
    brand: "Lift Foils",
    name: "LIFTX Battery Adapter",
    fits: ["LIFT5", "LIFT5 F"],
    variants: [{ id: "main", priceUsd: 299, images: img("liftx-battery-adapter", "main", 3) }],
  },
  {
    category: "accessory",
    id: "elite-hand-controller",
    brand: "Lift Foils",
    name: "Elite Hand Controller",
    fits: ["LIFT5", "LIFTX"],
    variants: [{ id: "main", priceUsd: 895, images: img("elite-hand-controller", "main", 3) }],
  },
  {
    category: "accessory",
    id: "lift-hand-controller",
    brand: "Lift Foils",
    name: "Lift Hand Controller",
    fits: ["LIFT5", "LIFT5 F", "LIFTX"],
    variants: [{ id: "main", priceUsd: 529, images: img("lift-hand-controller", "main", 3) }],
  },
  {
    category: "accessory",
    id: "propulsion-55",
    brand: "Lift Foils",
    name: "LCS Carbon 55 Propulsion",
    fits: ["LIFTX", "LIFT5", "LIFT5 F"],
    variants: [
      { id: "low", label: '32" Low Mount', priceUsd: 3_071, images: img("propulsion-55", "low", 2) },
      { id: "high", label: '32" High Mount', priceUsd: 3_071, images: img("propulsion-55", "high", 1) },
      {
        id: "ultra-high",
        label: '33" Ultra-High Mount',
        priceUsd: 3_071,
        images: img("propulsion-55", "ultra-high", 2),
      },
    ],
  },
  {
    category: "accessory",
    id: "blowfish",
    brand: "Lift Foils",
    name: "Blowfish",
    fits: ["LIFT5", "LIFT5 F"],
    // Размер Blowfish = размер доски, под которую он надевается. Фото общие:
    // у Lift они одни на все три размера.
    variants: ["4'4", "4'9", "5'4"].map((label) => ({
      id: label.replace("'", "-"),
      label,
      priceUsd: 599,
      images: img("blowfish", "main", 4),
    })),
  },
  {
    category: "accessory",
    id: "beach-wheels",
    brand: "Lift Foils",
    name: "LIFT5 Beach Wheels",
    fits: ["LIFT5", "LIFT5 F"],
    variants: [{ id: "main", priceUsd: 250, images: img("beach-wheels", "main", 2) }],
  },
  {
    category: "accessory",
    id: "battery-backpack",
    brand: "Lift Foils",
    name: "Battery Backpack",
    fits: ["LIFT5", "LIFT5 F", "LIFTX"],
    variants: [
      { id: "gen5", label: "Gen5", priceUsd: 85, images: img("battery-backpack", "gen5", 1) },
      { id: "liftx", label: "LIFTX", priceUsd: 85, images: img("battery-backpack", "liftx", 1) },
    ],
  },
];

export const shopProducts: ShopProduct[] = [...shopEfoils, ...shopAccessories];
