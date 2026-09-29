import { isDemo, demoRestaurantId, uuidPattern } from '@/lib/config';
import { notFound } from 'next/navigation';
import MenuClient from './MenuClient';

// Demo data fallback
const DEMO_RESTAURANT = { name: "The Grand Cafe" };
const DEMO_CATEGORIES = [
  { id: '1', name: 'Starters' },
  { id: '2', name: 'Mains' },
  { id: '3', name: 'Beverages' }
];
const DEMO_DISHES = [
  { id: '1', category_id: '1', name: 'Paneer Tikka', price: 250, description: 'Cottage cheese marinated in spices and grilled to perfection.', image_url: 'https://images.unsplash.com/photo-1599487405270-b07cd9e9ceeb?auto=format&fit=crop&w=500&q=60', is_veg: true },
  { id: '2', category_id: '1', name: 'Chicken Wings', price: 350, description: 'Spicy BBQ chicken wings, crispy on the outside.', image_url: 'https://images.unsplash.com/photo-1524114664604-cd8133cd67ad?auto=format&fit=crop&w=500&q=60', is_veg: false },
  { id: '3', category_id: '2', name: 'Margherita Pizza', price: 400, description: 'Classic delight with 100% real mozzarella cheese.', image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=500&q=60', is_veg: true },
  { id: '4', category_id: '2', name: 'Butter Chicken', price: 450, description: 'Tender chicken in a rich, buttery tomato sauce.', image_url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=500&q=60', is_veg: false },
  { id: '5', category_id: '3', name: 'Cold Coffee', price: 150, description: 'Thick and creamy cold coffee.', image_url: 'https://images.unsplash.com/photo-1461023058943-0708e5223eeb?auto=format&fit=crop&w=500&q=60', is_veg: true },
];

export default async function MenuPage({
  params
}: {
  params: Promise<{ restaurant_id: string; table_id: string }>
}) {
  const { restaurant_id, table_id } = await params;

  // Production table access is exclusively through the resettable public QR token.
  // This legacy identifier route remains available only for the local demo.
  if (!isDemo) notFound();
  
  const restaurant = DEMO_RESTAURANT;
  const categories = DEMO_CATEGORIES;
  const dishes = DEMO_DISHES;
  let tableName = 'Table 1';

  if (!uuidPattern.test(restaurant_id) || !uuidPattern.test(table_id)) notFound();
  if (isDemo) {
    if (restaurant_id !== demoRestaurantId || !['22222222-2222-2222-2222-222222222221','22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222223'].includes(table_id)) notFound();
    tableName = 'Table ' + table_id.slice(-1);
  }

  return (
    <MenuClient 
      key={`${restaurant_id}:${table_id}`}
      restaurant={restaurant}
      categories={categories}
      dishes={dishes}
      tableName={tableName}
      restaurantId={restaurant_id}
      tableId={table_id}
    />
  );
}
