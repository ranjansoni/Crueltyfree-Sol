export type Country = "CA" | "US";

export type Product = {
  id: string;
  brand: string;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  badges: string[];
  certifications: string[];
  tags: string[];
  rating: number;
  reviews: number;
  votes: number;
  colour: string;
  accent: string;
  prices: Record<Country, { price: number; currency: string; stores: string[] }>;
};

export const PRODUCTS: Product[] = [
  {
    id: "attitude-shampoo",
    brand: "ATTITUDE",
    name: "Super Leaves Volume Shampoo",
    category: "Hair care",
    subcategory: "Shampoo",
    description: "A gentle, vegan volumizing shampoo made in Canada with a light citrus finish.",
    badges: ["Best value", "Made in Canada"],
    certifications: ["PETA", "EWG Verified"],
    tags: ["shampoo", "hair", "volume", "vegan", "canadian", "drugstore"],
    rating: 4.7,
    reviews: 184,
    votes: 126,
    colour: "#dcead7",
    accent: "#416547",
    prices: {
      CA: { price: 11.97, currency: "CAD", stores: ["Walmart", "Well.ca", "London Drugs"] },
      US: { price: 12.95, currency: "USD", stores: ["Amazon", "ATTITUDE"] },
    },
  },
  {
    id: "elf-mascara",
    brand: "e.l.f.",
    name: "Lash 'N Roll Mascara",
    category: "Makeup",
    subcategory: "Mascara",
    description: "An affordable vegan mascara with a curved brush for lifted, separated lashes.",
    badges: ["Lowest price", "Community pick"],
    certifications: ["Leaping Bunny", "PETA"],
    tags: ["mascara", "makeup", "eyes", "budget", "vegan"],
    rating: 4.6,
    reviews: 392,
    votes: 241,
    colour: "#f1d8cf",
    accent: "#873e39",
    prices: {
      CA: { price: 8.00, currency: "CAD", stores: ["Shoppers Drug Mart", "Walmart", "Amazon.ca"] },
      US: { price: 6.00, currency: "USD", stores: ["Target", "Ulta", "e.l.f."] },
    },
  },
  {
    id: "the-ordinary-cleanser",
    brand: "The Ordinary",
    name: "Squalane Cleanser",
    category: "Skin care",
    subcategory: "Cleanser",
    description: "A non-comedogenic balm-to-oil cleanser that removes makeup without stripping skin.",
    badges: ["Editor's pick"],
    certifications: ["PETA"],
    tags: ["cleanser", "face wash", "skincare", "dry skin", "makeup remover"],
    rating: 4.8,
    reviews: 618,
    votes: 322,
    colour: "#e8e3dc",
    accent: "#4b4a47",
    prices: {
      CA: { price: 11.90, currency: "CAD", stores: ["Sephora", "The Ordinary", "The Bay"] },
      US: { price: 9.90, currency: "USD", stores: ["Sephora", "Ulta", "The Ordinary"] },
    },
  },
  {
    id: "live-clean-body-wash",
    brand: "Live Clean",
    name: "Fresh Water Body Wash",
    category: "Body care",
    subcategory: "Body wash",
    description: "A plant-derived daily body wash with a fresh scent and widely available refill sizes.",
    badges: ["Made in Canada"],
    certifications: ["PETA"],
    tags: ["body wash", "soap", "shower", "canadian", "budget"],
    rating: 4.5,
    reviews: 207,
    votes: 94,
    colour: "#d8e9e6",
    accent: "#206461",
    prices: {
      CA: { price: 7.49, currency: "CAD", stores: ["Shoppers Drug Mart", "Real Canadian Superstore", "Walmart"] },
      US: { price: 9.99, currency: "USD", stores: ["Amazon", "iHerb"] },
    },
  },
  {
    id: "method-cleaner",
    brand: "method",
    name: "All-Purpose Cleaner",
    category: "Home",
    subcategory: "Surface cleaner",
    description: "A biodegradable surface spray in a recycled-plastic bottle with broad retail availability.",
    badges: ["Household favourite"],
    certifications: ["Leaping Bunny"],
    tags: ["cleaner", "cleaning", "home", "kitchen", "surface spray"],
    rating: 4.7,
    reviews: 446,
    votes: 178,
    colour: "#e7dcc8",
    accent: "#765b2f",
    prices: {
      CA: { price: 5.97, currency: "CAD", stores: ["Walmart", "Canadian Tire", "Amazon.ca"] },
      US: { price: 4.49, currency: "USD", stores: ["Target", "Walmart", "Amazon"] },
    },
  },
  {
    id: "tom-green-deodorant",
    brand: "Tom's of Maine",
    name: "Natural Deodorant",
    category: "Personal care",
    subcategory: "Deodorant",
    description: "An aluminum-free everyday deodorant available in unscented and naturally scented options.",
    badges: ["Easy to find"],
    certifications: ["PETA"],
    tags: ["deodorant", "personal care", "aluminum free", "natural"],
    rating: 4.3,
    reviews: 151,
    votes: 63,
    colour: "#dce4d2",
    accent: "#3d6430",
    prices: {
      CA: { price: 7.99, currency: "CAD", stores: ["Well.ca", "Walmart", "Loblaws"] },
      US: { price: 5.99, currency: "USD", stores: ["Target", "CVS", "Whole Foods"] },
    },
  },
  {
    id: "pacifica-perfume",
    brand: "Pacifica",
    name: "Island Vanilla Hair & Body Mist",
    category: "Fragrance",
    subcategory: "Body mist",
    description: "A warm vanilla mist with a vegan formula in a travel-friendly bottle.",
    badges: ["Vegan"],
    certifications: ["PETA"],
    tags: ["perfume", "fragrance", "body mist", "vanilla", "vegan"],
    rating: 4.6,
    reviews: 281,
    votes: 138,
    colour: "#eee0ef",
    accent: "#754f78",
    prices: {
      CA: { price: 18.99, currency: "CAD", stores: ["Shoppers Drug Mart", "Well.ca"] },
      US: { price: 12.00, currency: "USD", stores: ["Target", "Ulta", "Pacifica"] },
    },
  },
  {
    id: "burts-lip-balm",
    brand: "Hurraw!",
    name: "Moon Lip Balm",
    category: "Skin care",
    subcategory: "Lip care",
    description: "A rich overnight lip balm made with organic, raw and vegan ingredients.",
    badges: ["Fully vegan"],
    certifications: ["Leaping Bunny"],
    tags: ["lip balm", "lips", "skincare", "vegan", "organic"],
    rating: 4.8,
    reviews: 165,
    votes: 117,
    colour: "#d8d7e9",
    accent: "#4f507f",
    prices: {
      CA: { price: 6.99, currency: "CAD", stores: ["Well.ca", "Healthy Planet"] },
      US: { price: 4.49, currency: "USD", stores: ["Whole Foods", "Amazon"] },
    },
  },
];

export const CATEGORIES = ["All", ...Array.from(new Set(PRODUCTS.map((product) => product.category)))];
export const CERTIFICATIONS = ["All standards", "Leaping Bunny", "PETA", "EWG Verified"];
