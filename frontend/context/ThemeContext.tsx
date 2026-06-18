import React, { createContext, useContext } from 'react';

export type ThemeType = 'light';

export interface ThemeColors {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryLight: string;
  secondary: string;
  danger: string;
  dangerLight: string;
  success: string;
  successLight: string;
  inputBackground: string;
  divider: string;
  headerBackground: string;
  tabBarBackground: string;
  shadow: string;
  badgeBackground: string;
  badgeText: string;
  accent: string;
}

const lightBlueTheme: ThemeColors = {
  background: '#EDF4FC',       // Very light blue background
  card: '#FFFFFF',             // Pure white cards
  text: '#1B2A4A',            // Dark navy text
  textSecondary: '#5A6B8A',   // Muted blue-gray secondary text
  border: '#C8D9EF',          // Soft blue border
  primary: '#2B6CB0',         // Deep blue primary
  primaryLight: '#E6F0FA',    // Very light blue tint
  secondary: '#3182CE',       // Medium blue secondary
  danger: '#C53030',          // Elegant muted red
  dangerLight: '#FFF5F5',     // Soft red background
  success: '#276749',         // Deep green success
  successLight: '#F0FFF4',    // Soft green background
  inputBackground: '#F7FAFF', // Near-white blue input bg
  divider: '#D6E4F0',         // Light blue divider
  headerBackground: '#FFFFFF', // White header
  tabBarBackground: '#FFFFFF', // White tab bar
  shadow: '#2B6CB0',          // Blue shadow
  badgeBackground: '#E6F0FA', // Light blue badge
  badgeText: '#2B6CB0',       // Deep blue badge text
  accent: '#1A4B8C',          // Deep accent blue for emphasis
};

interface ThemeContextType {
  theme: ThemeType;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme: ThemeType = 'light';
  const colors = lightBlueTheme;

  // toggleTheme is a no-op now (kept for API compatibility)
  const toggleTheme = () => {};

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
