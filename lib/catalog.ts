export type CatalogProduct = {
  id: number;
  name: string;
  price: number;
  description: string;
  color: string;
  category: string;
};

export const products: CatalogProduct[] = [
  { id: 1, name: 'The Everyday Tote', price: 148, description: 'Structured carryall in soft, durable vegan leather.', color: 'sand', category: 'Accessories' },
  { id: 2, name: 'Cloud Knit Set', price: 128, description: 'A polished matching set designed for effortless days.', color: 'mist', category: 'Apparel' },
  { id: 3, name: 'Ribbed Glass Set', price: 64, description: 'Four hand-finished glasses for your daily ritual.', color: 'amber', category: 'Home' },
  { id: 4, name: 'Weekender Duffel', price: 188, description: 'A roomy, refined companion for short escapes.', color: 'ink', category: 'Accessories' },
];

export const getProduct = (id: number) => products.find((product) => product.id === id);
