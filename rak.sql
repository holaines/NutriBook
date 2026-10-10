-- Menus publics du RAK (pas de RLS restrictif, lecture publique)
-- Executer dans Supabase > SQL Editor

CREATE TABLE IF NOT EXISTS public.rak_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_date date NOT NULL,
  service varchar(10) NOT NULL,        -- 'dejeuner' | 'diner'
  menu_type varchar(20) NOT NULL,      -- 'rampe' | 'cafeteria'
  dish_id integer NOT NULL,            -- id_plat du RAK
  dish_name text NOT NULL,
  dish_category varchar(30),           -- 'entree_chaude' | 'plat1' | 'accompagnement1' | etc.
  gluten_status varchar(30) NOT NULL DEFAULT 'unknown',
    -- 'confirmed_gf' | 'contains_gluten' | 'unknown'
  gluten_source varchar(30),           -- 'rak_official' | 'ai_analysis'
  gluten_reasoning text,
  iron_mg_estimated decimal(6,2),
  iron_confidence varchar(20),         -- 'official' | 'estimated' | 'approximate' | 'insufficient'
  iron_notes text,
  allergen_raw jsonb,                  -- donnees brutes de plat.php
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(menu_date, service, menu_type, dish_id)
);

ALTER TABLE public.rak_menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rak_menus_public_read" ON public.rak_menus;
CREATE POLICY "rak_menus_public_read" ON public.rak_menus
  FOR SELECT TO anon, authenticated USING (true);

-- Seule la Edge Function (service_role) peut inserer/mettre a jour.
-- Pas de policy INSERT/UPDATE pour anon/authenticated.
