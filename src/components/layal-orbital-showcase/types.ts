export interface ProductSelection {
  value: string | number;
  label?: string;
  key?: string;
}

export interface LayalOrbitalConfig {
  featured_product?: ProductSelection[];
  featured_image?: string;
  featured_alt?: string;
  orbit_products?: ProductSelection[];
  background_image?: string;
  background_color?: string;
  accent_color?: string;
  section_height?: number | string;
  rotation_speed?: number | string;
  reverse_direction?: boolean | string | number;
  enable_pointer_tilt?: boolean | string | number;
  enable_drag?: boolean | string | number;
  show_product_names?: boolean | string | number;
  show_interaction_hint?: boolean | string | number;
}

export interface SallaProductImage {
  url?: string;
  alt?: string | null;
}

export interface SallaProduct {
  id: string | number;
  name: string;
  url: string;
  image?: SallaProductImage;
}

export interface SallaProductResponse {
  data: SallaProduct;
}

export interface SallaStorefrontApi {
  onReady(): Promise<unknown> | unknown;
  product: {
    api: {
      getDetails(id: string | number): Promise<SallaProductResponse>;
    };
  };
  config?: {
    get(key: string, fallback?: unknown): unknown;
  };
}

export interface OrbitView {
  key: string;
  name: string;
  url?: string;
  imageUrl?: string;
  alt: string;
  placeholder: boolean;
}
