import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const SettingsContext = createContext();

const DEFAULT_SALES_CHANNELS = [
  { id: 'dine_in', label: 'หน้าร้าน', emoji: '🏪', isDefault: true },
  { id: 'grab',    label: 'Grab',     emoji: '🟢', isDefault: true },
  { id: 'lineman', label: 'LineMan',  emoji: '🟡', isDefault: true },
];

const DEFAULT_PAYMENT_METHODS = [
  { icon: 'Banknote', label: 'เงินสด (Cash)', value: 'cash', enabled: true, isDefault: true, gpPercent: 0, deliveryFee: 0 },
  { icon: 'CreditCard', label: 'โอนเงิน (Transfer)', value: 'transfer', enabled: true, isDefault: true, gpPercent: 0, deliveryFee: 0 },
  { icon: 'QrCode', label: 'สแกนจ่ายมือถือ', value: 'qr', enabled: true, isDefault: true, gpPercent: 0, deliveryFee: 0 },
  { icon: 'CreditCard', label: 'บัตรเครดิต', value: 'credit', enabled: false, isDefault: true, gpPercent: 2.5, deliveryFee: 0 },
  { icon: 'Motorcycle', label: 'Delivery', value: 'delivery', enabled: true, isDefault: true, gpPercent: 0, deliveryFee: 20 },
  { icon: 'Utensils', label: 'พนักงานทาน (Staff Meal)', value: 'staff_meal', enabled: true, isDefault: true, gpPercent: 0, deliveryFee: 0 }
];

const DEFAULT_SYSTEM_CONFIG = {
  vatPercent: 7,
  gpGrabPercent: 30,
  gpLinemanPercent: 30,
  receiptFooter: 'ขอบคุณที่ใช้บริการ สมชายหมูปิ้ง 🐷',
  lineOAToken: '',
  stockAlertDays: 2,
  dailySalesTarget: 10000,
  targetFcPercent: 35,
  targetGpPercent: 60,
};

export const SettingsProvider = ({ children }) => {
  const [salesChannels, setSalesChannels] = useState(DEFAULT_SALES_CHANNELS);
  const [paymentMethods, setPaymentMethods] = useState(DEFAULT_PAYMENT_METHODS);
  const [systemConfig, setSystemConfig] = useState(DEFAULT_SYSTEM_CONFIG);
  const [companyInfo, setCompanyInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load from Supabase on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error: sbError } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (sbError && sbError.code !== 'PGRST116') {
        // PGRST116 means zero rows, which is fine, we'll use defaults
        throw sbError;
      }

      if (data) {
        if (data.sales_channels) setSalesChannels(data.sales_channels);
        if (data.payment_methods) setPaymentMethods(data.payment_methods);
        if (data.system_config) setSystemConfig(data.system_config);
        if (data.company_info) setCompanyInfo(data.company_info);
      }
    } catch (err) {
      console.error('Fetch Settings Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (type, payload) => {
    try {
      // 1. Optimistic UI update
      let dbPayload = {};
      if (type === 'sales_channels') {
        setSalesChannels(payload);
        dbPayload = { sales_channels: payload };
      } else if (type === 'payment_methods') {
        setPaymentMethods(payload);
        dbPayload = { payment_methods: payload };
      } else if (type === 'system_config') {
        setSystemConfig(payload);
        dbPayload = { system_config: payload };
      } else if (type === 'company_info') {
        setCompanyInfo(payload);
        dbPayload = { company_info: payload };
      }

      // 2. Persist to DB
      const { error: saveErr } = await supabase
        .from('app_settings')
        .upsert({ id: 1, ...dbPayload }, { onConflict: 'id' });

      if (saveErr) throw saveErr;

      // Also trigger a global event for backwards compatibility with non-React state if needed
      if (type === 'sales_channels') {
        window.dispatchEvent(new Event('salesChannelsUpdate'));
      }
      
      return { success: true };
    } catch (err) {
      console.error('Update Settings Error:', err);
      return { success: false, error: err.message };
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        salesChannels,
        paymentMethods,
        systemConfig,
        companyInfo,
        loading,
        error,
        updateSettings,
        refreshSettings: fetchSettings
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
