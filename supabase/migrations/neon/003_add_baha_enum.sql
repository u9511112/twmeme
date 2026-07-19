-- Add 'baha' to platform_enum for Bahamut scraper support
ALTER TYPE platform_enum ADD VALUE IF NOT EXISTS 'baha';
