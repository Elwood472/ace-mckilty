export type User = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
};

export type WishList = {
  id: string;
  group_id: string;
  title: string;
  list_type: "personal" | "together";
  created_at: string;
};

export type Item = {
  id: string;
  list_id: string;
  title: string;
  notes: string;
  url: string;
  price: string | null;
  category: string;
  source: string;
  quantity: number | null;
  image_url: string;
  display_date: string | null;
  restricted: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ItemView = Item & {
  purchased_qty: number;
  remaining: number | null;
  is_taken: boolean;
  i_bought: boolean;
  viewer_names?: string[];
};

export type SortKey = "title" | "price" | "category" | "display_date";
export type SortDir = "asc" | "desc";
