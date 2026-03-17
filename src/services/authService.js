import { supabase } from '../lib/supabase';

// ==========================================
// USERS API
// ==========================================

export async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select(`
      *,
      branches:branch_id (name)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
  return data;
}

export async function createUser(userData) {
  const { data, error } = await supabase
    .from('users')
    .insert([userData])
    .select()
    .single();

  if (error) {
    console.error('Error creating user:', error);
    throw error;
  }
  return data;
}

export async function updateUser(id, updates) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating user:', error);
    throw error;
  }
  return data;
}

export async function deleteUser(id) {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
  return true;
}

// ==========================================
// BRANCHES API
// ==========================================

export async function getBranches() {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching branches:', error);
    throw error;
  }
  return data;
}

export async function createBranch(branchData) {
  const { data, error } = await supabase
    .from('branches')
    .insert([branchData])
    .select()
    .single();

  if (error) {
    console.error('Error creating branch:', error);
    throw error;
  }
  return data;
}

export async function updateBranch(id, updates) {
  const { data, error } = await supabase
    .from('branches')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating branch:', error);
    throw error;
  }
  return data;
}
