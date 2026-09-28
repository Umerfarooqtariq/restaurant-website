import galleryJson from "../../data/gallery.json";
import menuJson from "../../data/menu.json";
import restaurantJson from "../../data/restaurant.json";
import settingsJson from "../../data/settings.json";
import { gallerySchema, menuSchema, restaurantSchema, settingsSchema, type Gallery, type Menu, type Restaurant, type Settings } from "../../shared/schema";
import { isPlaceholder } from "../../shared/text";

export const restaurant: Restaurant = restaurantSchema.parse(restaurantJson);
export const menu: Menu = menuSchema.parse(menuJson);
export const gallery: Gallery = gallerySchema.parse(galleryJson);
export const settings: Settings = settingsSchema.parse(settingsJson);

export function menuHasDemo(data: Menu = menu) {
  return data.categories.some((category) => category.demo || category.items.some((item) => item.demo));
}

export function featuredDishes(data: Menu = menu) {
  return data.categories.flatMap((category) =>
    category.items.filter((item) => item.featured).map((item) => ({ category, item })),
  );
}

export function visibleHours(data: Restaurant = restaurant) {
  return data.openingHours.filter((entry) => !isPlaceholder(entry.label));
}

export function placeLabel(data: Restaurant = restaurant) {
  return [data.city, data.country].filter((part) => part && !isPlaceholder(part)).join(", ");
}
