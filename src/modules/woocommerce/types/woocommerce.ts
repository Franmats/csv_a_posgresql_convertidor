export interface WCProduct {
  id: number;
  name: string;
  status: string;
  sku: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number;
  images: WCImage[];
  attributes: WCAttribute[];
  variations: number[];
}

export interface WCVariation {
  id: number;
  sku: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number;
  attributes: WCVariationAttribute[];
}

export interface WCAttribute {
  name: string;
  options: string[];
  variation: boolean;
  visible: boolean;
}

export interface WCVariationAttribute {
  name: string;
  option: string;
}

export interface WCImage {
  id: number;
  src: string;
}

export interface WCOrder {
  id: number;
  number: string;
  status: string;
  payment_method: string;
  payment_method_title: string;
  total: string;
  discount_total: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    city: string;
    state: string;
    postcode: string;
  };
  line_items: WCLineItem[];
  meta_data: WCMeta[];
}

export interface WCLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  sku: string;
  price: number;
  subtotal: string;
  total: string;
}

export interface WCMeta {
  key: string;
  value: string;
}