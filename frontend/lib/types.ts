export interface Category {
  id: number;
  name: string;
  nameAr?: string | null;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId?: number | null;
  productCount: number;
}

export interface Brand {
  id: number;
  name: string;
  slug: string;
  logoUrl?: string | null;
}

export interface HeroBanner {
  id: number;
  title: string;
  titleAr?: string | null;
  subtitle?: string | null;
  subtitleAr?: string | null;
  ctaLabel?: string | null;
  ctaLabelAr?: string | null;
  ctaHref: string;
  imageUrl?: string | null;
  align: 'left' | 'center' | 'right';
  overlay: number;
}

export interface ProductSummary {
  id: number;
  name: string;
  nameAr?: string | null;
  slug: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
  stockQty: number;
  isFeatured: boolean;
  isBestSeller: boolean;
  soldCount: number;
  ratingAvg: number;
  ratingCount: number;
  image: string | null;
  category: { id: number; name: string; nameAr?: string | null; slug: string } | null;
  brand: { id: number; name: string } | null;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  descriptionAr?: string | null;
  barcode: string | null;
  unit: string;
  specs: { key: string; value: string }[];
  images: { url: string; alt?: string }[];
  related: ProductSummary[];
}

export interface ProductReview {
  id: number;
  rating: number;
  title: string | null;
  body: string | null;
  author: string;
  createdAt: string;
}

export interface ProductList {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CheckoutConfig {
  currency: string;
  taxPct: number;
  freeShippingOver: number;
  defaultShipping: number;
  paymentMethods: string[];
  loyalty: { enabled: boolean; earnRate: number; redeemRate: number };
}

export interface OrderItem {
  id: number;
  productId: number;
  name: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderEvent {
  id: number;
  status: string;
  note: string | null;
  createdAt: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  trackingNumber: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  shipArea: string;
  shipBlock: string | null;
  status: string;
  payStatus: string;
  payMethod: string;
  deliveryMethod: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  couponCode: string | null;
  items: OrderItem[];
  events: OrderEvent[];
  placedAt: string;
}
