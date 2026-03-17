import { supabase } from '../lib/supabase';

// ==========================================
// EXPENSE CATEGORIES API
// ==========================================

export async function getExpenseCategories() {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching expense categories:', error);
    throw error;
  }
  return data;
}

export async function createExpenseCategory(categoryData) {
  const { data, error } = await supabase
    .from('expense_categories')
    .insert([categoryData])
    .select()
    .single();

  if (error) {
    console.error('Error creating expense category:', error);
    throw error;
  }
  return data;
}

export async function updateExpenseCategory(id, updates) {
  const { data, error } = await supabase
    .from('expense_categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating expense category:', error);
    throw error;
  }
  return data;
}

export async function deleteExpenseCategory(id) {
  const { error } = await supabase
    .from('expense_categories')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting expense category:', error);
    throw error;
  }
  return true;
}
