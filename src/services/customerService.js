import { supabase } from '../lib/supabase';

export const getCustomers = async () => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching customers:', err);
    return null;
  }
};

export const createCustomer = async (customerData) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .insert([customerData])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error creating customer:', err);
    throw err;
  }
};

export const updateCustomer = async (id, updateData) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error updating customer:', err);
    throw err;
  }
};

export const deleteCustomer = async (id) => {
  try {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting customer:', err);
    throw err;
  }
};
