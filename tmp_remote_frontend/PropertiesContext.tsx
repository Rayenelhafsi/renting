import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Bien, BienStatut, Media, DateStatus, BienType, Zone, Proprietaire, BienMode, TypePapierAppartementVente, TypeRueAppartementVente, TypeTerrainVente, LocationSaisonniereConfig, SeasonalPricingPeriod } from '../admin/types';
import { Property } from '../data/properties';
import { toYouTubeThumbnailUrl } from '../utils/videoLinks';
import { extractGuestLimitsFromCharacteristicLines, resolveBienCapacity } from '../utils/bienCapacity';
import { buildPropertyDetailsPath } from '../utils/propertyRouting';

// API Base URL
const API_URL = import.meta.env.VITE_API_URL || '/api';
const CHARACTERISTICS_MARKER = '[CARACTERISTIQUES_JSON]';
const PROPERTY_FALLBACK_IMAGE_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 675'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23e5e7eb'/%3E%3Cstop offset='100%25' stop-color='%23cbd5e1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='675' fill='url(%23g)'/%3E%3C/svg%3E";
function resolvePublicMediaUrl(url?: string | null): string {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (typeof window === 'undefined') return value;
  const base = /^https?:\/\//i.test(API_URL)
    ? API_URL
    : (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : window.location.origin);
  const origin = new URL(base, window.location.origin).origin;
  return value.startsWith('/') ? `${origin}${value}` : value;
}

const LEGACY_TYPE_MAP: Record<string, BienType> = {
  S1: 'appartement',
  S2: 'appartement',
  S3: 'appartement',
  S4: 'appartement',
  villa: 'villa_maison',
  local: 'local_commercial',
};
const DEFAULT_MODE: BienMode = 'location_saisonniere';
const DEFAULT_MODE_PRIORITIES: Record<BienMode, number> = {
  location_saisonniere: 1,
  vente: 2,
  location_annuelle: 3,
};

async function getApiErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || '').trim();
    if (message) return message;
  } else {
    const text = await response.text().catch(() => '');
    if (text && !text.startsWith('<!DOCTYPE')) return text;
  }
  return fallback;
}

function normalizeBienType(type: string): BienType {
  return (LEGACY_TYPE_MAP[type] || type || 'appartement') as BienType;
}

function normalizePricingWeekday(value: unknown): 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche' | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'lundi' || normalized === 'mardi' || normalized === 'mercredi' || normalized === 'jeudi' || normalized === 'vendredi' || normalized === 'samedi' || normalized === 'dimanche') {
    return normalized;
  }
  return null;
}

function parseDescriptionAndCharacteristics(rawDescription?: string | null): { description: string; caracteristiques: string[] } {
  const descriptionText = rawDescription || '';
  const markerIndex = descriptionText.indexOf(CHARACTERISTICS_MARKER);
  if (markerIndex === -1) {
    return { description: descriptionText, caracteristiques: [] };
  }

  const cleanDescription = descriptionText.slice(0, markerIndex).trim();
  const jsonPart = descriptionText.slice(markerIndex + CHARACTERISTICS_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    return {
      description: cleanDescription,
      caracteristiques: Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [],
    };
  } catch {
    return { description: cleanDescription, caracteristiques: [] };
  }
}

// ============================================
// CONVERSION UTILITIES
// ============================================

// Convert DB row to Bien format (without unavailable dates - fetched separately)
function dbRowToBien(row: any, media: any[] = [], unavailableDates: any[] = []): Bien {
  // Helper to convert string/number to number
  const toNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    return parseFloat(val) || 0;
  };
  const toNullableNumber = (val: any): number | null => {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return Number.isFinite(val) ? val : null;
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const toBoolean = (val: any): boolean => val === 1 || val === true || val === '1';
  const toStringArray = (val: any): string[] => Array.isArray(val)
    ? val.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  const parsedDescription = parseDescriptionAndCharacteristics(row.description);
  let immeubleDetails: any = {};
  let terrainDetails: any = {};
  let immeubleAppartements: any[] = [];
  let lotissementTerrains: any[] = [];
  let lotissementPaliersPrix: any[] = [];
  try {
    const raw = (row as any).immeuble_details_json;
    if (raw) immeubleDetails = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {}
  try {
    const raw = (row as any).immeuble_appartements_json;
    if (raw) immeubleAppartements = Array.isArray(raw) ? raw : JSON.parse(raw);
  } catch {}
  try {
    const raw = (row as any).terrain_details_json;
    if (raw) terrainDetails = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {}
  try {
    const raw = (row as any).lotissement_terrains_json;
    if (raw) lotissementTerrains = Array.isArray(raw) ? raw : JSON.parse(raw);
  } catch {}
  try {
    const raw = (row as any).lotissement_paliers_prix_m2_json;
    if (raw) lotissementPaliersPrix = Array.isArray(raw) ? raw : JSON.parse(raw);
  } catch {}
  let uiConfig: any = null;
  try {
    const raw = (row as any).ui_config_json;
    if (raw) uiConfig = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {}
  let locationSaisonniereConfig: LocationSaisonniereConfig | null = null;
  try {
    const raw = (row as any).location_saisonniere_config_json;
    if (raw) locationSaisonniereConfig = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {}
  let pricingPeriodsFromDb: SeasonalPricingPeriod[] = [];
  try {
    const rawPricingPeriods = (row as any).pricing_periods_json;
    if (rawPricingPeriods) {
      const parsed = typeof rawPricingPeriods === 'string' ? JSON.parse(rawPricingPeriods) : rawPricingPeriods;
      if (Array.isArray(parsed)) {
        pricingPeriodsFromDb = parsed
          .map((item: any) => ({
            id: item?.id ? String(item.id) : undefined,
            start: String(item?.start || item?.start_date || '').slice(0, 10),
            end: String(item?.end || item?.end_date || '').slice(0, 10),
            prix_nuitee: Number(item?.prix_nuitee || 0),
            prix_semaine: item?.prix_semaine === null || item?.prix_semaine === undefined ? null : Number(item.prix_semaine || 0),
            minimum_nuitees: item?.minimum_nuitees === null || item?.minimum_nuitees === undefined ? null : Math.max(1, Math.floor(Number(item.minimum_nuitees || 0))),
            checkin_jour: normalizePricingWeekday(item?.checkin_jour),
            checkout_jour: normalizePricingWeekday(item?.checkout_jour),
            scope: String(item?.scope || '').trim().toLowerCase() === 'amicale'
              ? 'amicale'
              : (String(item?.scope || '').trim().toLowerCase() === 'amicales' ? 'amicales' : (String(item?.amicale_id || item?.amicaleId || '').trim() ? 'amicale' : 'global')),
            amicale_id: String(item?.amicale_id || item?.amicaleId || '').trim() || null,
          }))
          .filter((item) =>
            item.start
            && item.end
            && isValidSqlDate(item.start)
            && isValidSqlDate(item.end)
            && item.end >= item.start
            && Number.isFinite(item.prix_nuitee)
            && item.prix_nuitee > 0
          );
      }
    }
  } catch {}
  if (pricingPeriodsFromDb.length === 0 && Array.isArray((locationSaisonniereConfig as any)?.pricing_periods)) {
    pricingPeriodsFromDb = ((locationSaisonniereConfig as any).pricing_periods as any[])
      .map((item: any) => ({
        id: item?.id ? String(item.id) : undefined,
        start: String(item?.start || item?.start_date || '').slice(0, 10),
        end: String(item?.end || item?.end_date || '').slice(0, 10),
        prix_nuitee: Number(item?.prix_nuitee || 0),
        prix_semaine: item?.prix_semaine === null || item?.prix_semaine === undefined ? null : Number(item.prix_semaine || 0),
        minimum_nuitees: item?.minimum_nuitees === null || item?.minimum_nuitees === undefined ? null : Math.max(1, Math.floor(Number(item.minimum_nuitees || 0))),
        checkin_jour: normalizePricingWeekday(item?.checkin_jour),
        checkout_jour: normalizePricingWeekday(item?.checkout_jour),
        scope: String(item?.scope || '').trim().toLowerCase() === 'amicale'
          ? 'amicale'
          : (String(item?.scope || '').trim().toLowerCase() === 'amicales' ? 'amicales' : (String(item?.amicale_id || item?.amicaleId || '').trim() ? 'amicale' : 'global')),
        amicale_id: String(item?.amicale_id || item?.amicaleId || '').trim() || null,
      }))
      .filter((item) =>
        item.start
        && item.end
        && isValidSqlDate(item.start)
        && isValidSqlDate(item.end)
        && item.end >= item.start
        && Number.isFinite(item.prix_nuitee)
        && item.prix_nuitee > 0
      );
  }
  const caracteristiquesFromDb = typeof row.caracteristiques_list === 'string' && row.caracteristiques_list.trim().length > 0
    ? row.caracteristiques_list.split('||').map((x: string) => x.trim()).filter(Boolean)
    : [];
  const caracteristiquesWithValuesFromDb = typeof (row as any).caracteristiques_with_values_list === 'string' && String((row as any).caracteristiques_with_values_list).trim().length > 0
    ? String((row as any).caracteristiques_with_values_list).split('||').map((x: string) => x.trim()).filter(Boolean)
    : [];
  const caracteristiqueIdsFromDb = typeof row.caracteristique_ids_list === 'string' && row.caracteristique_ids_list.trim().length > 0
    ? row.caracteristique_ids_list.split('||').map((x: string) => x.trim()).filter(Boolean)
    : [];
  let caracteristiqueValeursFromDb: Record<string, string | string[]> = {};
  try {
    const rawValues = (row as any).caracteristique_valeurs_json;
    if (rawValues && String(rawValues).trim().length > 0) {
      const parsed = typeof rawValues === 'string' ? JSON.parse(rawValues) : rawValues;
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
          const featureId = String(key || '').trim();
          if (!featureId) return;
          if (Array.isArray(value)) {
            const values = value.map((item) => String(item || '').trim()).filter(Boolean);
            if (values.length > 0) caracteristiqueValeursFromDb[featureId] = values;
          } else if (value !== null && value !== undefined) {
            const normalized = String(value || '').trim();
            if (normalized) caracteristiqueValeursFromDb[featureId] = normalized;
          }
        });
      }
    }
  } catch {}

  const effectiveCaracteristiques = caracteristiquesWithValuesFromDb.length > 0
    ? caracteristiquesWithValuesFromDb
    : (caracteristiquesFromDb.length > 0 ? caracteristiquesFromDb : parsedDescription.caracteristiques);
  const resolvedCapacity = resolveBienCapacity({
    nbChambres: row.nb_chambres,
    nbSalleBain: row.nb_salle_bain,
    configuration: (row as any).configuration || null,
    caracteristiques: effectiveCaracteristiques,
  });

  return {
    id: row.id,
    reference: row.reference,
    titre: row.titre,
    nom_bien_mobile: String((row as any).nom_bien_mobile || (locationSaisonniereConfig as any)?.nom_bien_mobile || '').trim() || null,
    description: parsedDescription.description,
    caracteristiques: effectiveCaracteristiques,
    caracteristique_ids: caracteristiqueIdsFromDb,
    caracteristique_valeurs: caracteristiqueValeursFromDb,
    mode: (row.mode || row.mode_bien || DEFAULT_MODE) as BienMode,
    type: normalizeBienType(row.type),
    nb_chambres: resolvedCapacity.bedrooms,
    nb_salle_bain: resolvedCapacity.bathrooms,
    prix_nuitee: toNumber(row.prix_nuitee),
    prix_semaine: toNullableNumber((row as any).prix_semaine),
    tarification_methode: ((row as any).tarification_methode || null) as any,
    prix_affiche_client: toNullableNumber((row as any).prix_affiche_client),
    prix_fixe_proprietaire: toNullableNumber((row as any).prix_fixe_proprietaire),
    prix_proprietaire: toNullableNumber((row as any).prix_proprietaire),
    prix_final: toNullableNumber((row as any).prix_final),
    revenu_agence: toNullableNumber((row as any).revenu_agence),
    commission_pourcentage_proprietaire: toNullableNumber((row as any).commission_pourcentage_proprietaire),
    commission_pourcentage_client: toNullableNumber((row as any).commission_pourcentage_client),
    montant_max_reduction_negociation: toNullableNumber((row as any).montant_max_reduction_negociation),
    prix_minimum_accepte: toNullableNumber((row as any).prix_minimum_accepte),
    modalite_paiement_vente: ((row as any).modalite_paiement_vente || null) as any,
    pourcentage_premiere_partie_promesse: toNullableNumber((row as any).pourcentage_premiere_partie_promesse),
    montant_premiere_partie_promesse: toNullableNumber((row as any).montant_premiere_partie_promesse),
    montant_deuxieme_partie: toNullableNumber((row as any).montant_deuxieme_partie),
    nombre_tranches: toNullableNumber((row as any).nombre_tranches),
    periode_tranches_mois: toNullableNumber((row as any).periode_tranches_mois),
    montant_par_tranche: toNullableNumber((row as any).montant_par_tranche),
    avance: toNumber(row.avance),
    caution: toNumber((row as any).caution),
    type_rue: ((row as any).type_rue || null) as TypeRueAppartementVente | null,
    type_papier: ((row as any).type_papier || null) as TypePapierAppartementVente | null,
    superficie_m2: toNullableNumber((row as any).superficie_m2),
    etage: toNullableNumber((row as any).etage),
    configuration: resolvedCapacity.configuration,
    annee_construction: toNullableNumber((row as any).annee_construction),
    distance_plage_m: toNullableNumber((row as any).distance_plage_m),
    proche_plage: toBoolean((row as any).proche_plage),
    chauffage_central: toBoolean((row as any).chauffage_central),
    climatisation: toBoolean((row as any).climatisation),
    balcon: toBoolean((row as any).balcon),
    terrasse: toBoolean((row as any).terrasse),
    ascenseur: toBoolean((row as any).ascenseur),
    vue_mer: toBoolean((row as any).vue_mer),
    gaz_ville: toBoolean((row as any).gaz_ville),
    cuisine_equipee: toBoolean((row as any).cuisine_equipee),
    place_parking: toBoolean((row as any).place_parking),
    syndic: toBoolean((row as any).syndic),
    meuble: toBoolean((row as any).meuble),
    independant: toBoolean((row as any).independant),
    eau_puits: toBoolean((row as any).eau_puits),
    eau_sonede: toBoolean((row as any).eau_sonede),
    electricite_steg: toBoolean((row as any).electricite_steg),
    surface_local_m2: toNullableNumber((row as any).surface_local_m2),
    facade_m: toNullableNumber((row as any).facade_m),
    hauteur_plafond_m: toNullableNumber((row as any).hauteur_plafond_m),
    activite_recommandee: ((row as any).activite_recommandee || null) as string | null,
    toilette: toBoolean((row as any).toilette),
    reserve_local: toBoolean((row as any).reserve_local),
    vitrine: toBoolean((row as any).vitrine),
    coin_angle: toBoolean((row as any).coin_angle),
    electricite_3_phases: toBoolean((row as any).electricite_3_phases),
    alarme: toBoolean((row as any).alarme),
    type_terrain: ((row as any).type_terrain || null) as TypeTerrainVente | null,
    terrain_facade_m: toNullableNumber((row as any).terrain_facade_m),
    terrain_surface_m2: toNullableNumber((row as any).terrain_surface_m2),
    terrain_distance_plage_m: toNullableNumber((row as any).terrain_distance_plage_m),
    terrain_zone: ((row as any).terrain_zone || null) as string | null,
    terrain_constructible: toBoolean((row as any).terrain_constructible),
    terrain_angle: toBoolean((row as any).terrain_angle),
    terrain_prix_affiche_total: toNullableNumber((row as any).terrain_prix_affiche_total),
    terrain_prix_affiche_par_m2: toNullableNumber((row as any).terrain_prix_affiche_par_m2),
    terrain_mode_affichage_prix: ((row as any).terrain_mode_affichage_prix || null) as any,
    terrain_disponibilite_reseaux: toStringArray((terrainDetails as any).disponibilite_reseaux),
    terrain_hauteur_construction_autorisee: ((terrainDetails as any).hauteur_construction_autorisee || null) as any,
    terrain_route_acces_largeur_m: toNullableNumber((terrainDetails as any).route_acces_largeur_m),
    terrain_forme: ((terrainDetails as any).forme || null) as string | null,
    terrain_topographie: ((terrainDetails as any).topographie || null) as any,
    terrain_bornage: toBoolean((terrainDetails as any).bornage),
    terrain_travaux_municipalite_autorises: toBoolean((terrainDetails as any).travaux_municipalite_autorises),
    terrain_limites_cadastrales: toBoolean((terrainDetails as any).limites_cadastrales),
    terrain_visualisation_limites_cadastrales: toBoolean((terrainDetails as any).visualisation_limites_cadastrales),
    terrain_voisinage: ((terrainDetails as any).voisinage || null) as any,
    terrain_proximites_commodites: toStringArray((terrainDetails as any).proximites_commodites),
    terrain_proximites_commodites_autres: ((terrainDetails as any).proximites_commodites_autres || null) as string | null,
    terrain_viabilisation_eau_sources: toStringArray((terrainDetails as any).viabilisation_eau_sources),
    terrain_viabilisation_onas: ((terrainDetails as any).viabilisation_onas || null) as any,
    terrain_viabilisation_steg: ((terrainDetails as any).viabilisation_steg || null) as any,
    terrain_viabilisation_gaz_ville: toBoolean((terrainDetails as any).viabilisation_gaz_ville),
    terrain_viabilisation_fibre_optique: toBoolean((terrainDetails as any).viabilisation_fibre_optique),
    terrain_viabilisation_telephone_fixe: toBoolean((terrainDetails as any).viabilisation_telephone_fixe),
    terrain_type_sol: ((terrainDetails as any).type_sol || null) as any,
    terrain_vegetation: ((terrainDetails as any).vegetation || null) as string | null,
    terrain_niveau_sonore: ((terrainDetails as any).niveau_sonore || null) as any,
    terrain_risque_inondation: toBoolean((terrainDetails as any).risque_inondation),
    terrain_exposition_vent: ((terrainDetails as any).exposition_vent || null) as string | null,
    terrain_ideal_utilisations: toStringArray((terrainDetails as any).ideal_utilisations),
    terrain_documents_disponibles: toStringArray((terrainDetails as any).documents_disponibles),
    immeuble_surface_terrain_m2: toNullableNumber((immeubleDetails as any).surface_terrain_m2),
    immeuble_surface_batie_m2: toNullableNumber((immeubleDetails as any).surface_batie_m2),
    immeuble_nb_niveaux: toNullableNumber((immeubleDetails as any).nb_niveaux),
    immeuble_nb_garages: toNullableNumber((immeubleDetails as any).nb_garages),
    immeuble_nb_appartements: toNullableNumber((immeubleDetails as any).nb_appartements),
    immeuble_nb_locaux_commerciaux: toNullableNumber((immeubleDetails as any).nb_locaux_commerciaux),
    immeuble_distance_plage_m: toNullableNumber((immeubleDetails as any).distance_plage_m),
    immeuble_proche_plage: toBoolean((immeubleDetails as any).proche_plage),
    immeuble_ascenseur: toBoolean((immeubleDetails as any).ascenseur),
    immeuble_parking_sous_sol: toBoolean((immeubleDetails as any).parking_sous_sol),
    immeuble_parking_exterieur: toBoolean((immeubleDetails as any).parking_exterieur),
    immeuble_syndic: toBoolean((immeubleDetails as any).syndic),
    immeuble_vue_mer: toBoolean((immeubleDetails as any).vue_mer),
    immeuble_appartements: (Array.isArray(immeubleAppartements) ? immeubleAppartements : []).map((item, idx) => ({
      index: Number(item?.index || idx + 1),
      reference: item?.reference ? String(item.reference) : null,
      chambres: Number(item?.chambres || 0),
      salle_bain: Number(item?.salle_bain || 0),
      superficie_m2: toNullableNumber(item?.superficie_m2),
      configuration: item?.configuration ? String(item.configuration) : null,
    })),
    immeuble_garages: (Array.isArray((immeubleDetails as any)?.garages) ? (immeubleDetails as any).garages : []).map((item: any, idx: number) => ({
      index: Number(item?.index || idx + 1),
      reference: item?.reference ? String(item.reference) : null,
    })),
    immeuble_locaux_commerciaux: (Array.isArray((immeubleDetails as any)?.locaux_commerciaux) ? (immeubleDetails as any).locaux_commerciaux : []).map((item: any, idx: number) => ({
      index: Number(item?.index || idx + 1),
      reference: item?.reference ? String(item.reference) : null,
    })),
    lotissement_nb_terrains: toNullableNumber((row as any).lotissement_nb_terrains),
    lotissement_prix_total: toNullableNumber((row as any).lotissement_prix_total),
    lotissement_mode_prix_m2: ((row as any).lotissement_mode_prix_m2 || null) as any,
    lotissement_prix_m2_unique: toNullableNumber((row as any).lotissement_prix_m2_unique),
    lotissement_terrains: (Array.isArray(lotissementTerrains) ? lotissementTerrains : []).map((item, idx) => ({
      index: Number(item?.index || idx + 1),
      reference: item?.reference ? String(item.reference) : null,
      type_terrain: (item?.type_terrain || null) as TypeTerrainVente | null,
      surface_m2: toNullableNumber(item?.surface_m2),
      type_rue: (item?.type_rue || null) as TypeRueAppartementVente | null,
      type_papier: (item?.type_papier || null) as TypePapierAppartementVente | null,
      terrain_zone: item?.terrain_zone ? String(item.terrain_zone) : null,
      terrain_distance_plage_m: toNullableNumber(item?.terrain_distance_plage_m),
      terrain_constructible: toBoolean(item?.terrain_constructible),
      terrain_angle: toBoolean(item?.terrain_angle),
    })),
    lotissement_paliers_prix_m2: (Array.isArray(lotissementPaliersPrix) ? lotissementPaliersPrix : []).map((item) => ({
      min_m2: Number(item?.min_m2 || 0),
      max_m2: toNullableNumber(item?.max_m2),
      prix_m2: Number(item?.prix_m2 || 0),
    })),
    statut: row.statut as BienStatut,
    visible_sur_site: row.visible_sur_site === 1 || row.visible_sur_site === true || row.visible_sur_site === '1',
    is_featured: row.is_featured === 1 || row.is_featured === true || row.is_featured === '1',
    ui_config: uiConfig && typeof uiConfig === 'object' ? uiConfig : null,
    location_saisonniere_config: locationSaisonniereConfig && typeof locationSaisonniereConfig === 'object' ? locationSaisonniereConfig : null,
    menage_en_cours: row.menage_en_cours === 1 || row.menage_en_cours === true || row.menage_en_cours === '1',
    zone_id: row.zone_id,
    proprietaire_id: row.proprietaire_id,
    date_ajout: row.date_ajout,
    created_at: row.created_at,
    updated_at: row.updated_at,
    admin_last_saved_at: (row as any).admin_last_saved_at || null,
    media: (Array.isArray(media) ? media : [])
      .map(m => ({
        id: m.id,
        bien_id: m.bien_id,
        type: m.type,
        url: m.url,
        position: m.position || 0,
        motif_upload: m.motif_upload || null,
      }))
      .sort((a, b) => (a.position || 0) - (b.position || 0)),

    unavailableDates: (Array.isArray(unavailableDates) ? unavailableDates : []).map(ud => ({
      id: ud.id ? String(ud.id) : undefined,
      start: ud.start_date,
      end: ud.end_date,
      status: ud.status,
      color: ud.color || (ud.status === 'booked' ? '#ef4444' : ud.status === 'pending' ? '#f97316' : '#111827'),
      paymentDeadline: ud.paymentDeadline || ud.payment_deadline || undefined,
      reservationDemandId: ud.reservation_demand_id ? String(ud.reservation_demand_id) : null,
    })),
    pricing_periods: pricingPeriodsFromDb,
  };
}

function isValidSqlDate(value: string): boolean {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

// Convert Bien (Admin format) to Property (Site format)
function bienToProperty(bien: Bien, zoneNames: Record<string, string> = {}): Property {
  const typeToCategory: Record<string, string> = {
    'S1': 'S+1',
    'S2': 'S+2',
    'S3': 'S+3',
    'S4': 'S+4',
    'appartement': 'S+1',
    'villa_maison': 'Villa',
    'studio': 'Studio',
    'local': 'S+1',
    'local_commercial': 'S+1',
    'immeuble': 'S+4',
    'terrain': 'S+1',
    'lotissement': 'S+1',
    'bungalow': 'Villa',
    'villa': 'Villa',
  };
  const typeToMainLabel: Record<string, string> = {
    appartement: 'Appartement',
    villa_maison: 'Villa',
    villa: 'Villa',
    maison: 'Maison',
    studio: 'Studio',
    bungalow: 'Bungalow',
    terrain: 'Terrain',
    lotissement: 'Lotissement',
    immeuble: 'Immeuble',
    local: 'Local',
    local_commercial: 'Local commercial',
  };

  const venteDetailPath = bien.mode === 'vente' && bien.type === 'immeuble'
    ? `/vente/immeuble/${encodeURIComponent((bien.titre || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`
    : bien.mode === 'vente' && bien.type === 'lotissement'
      ? `/vente/lotissement/${encodeURIComponent((bien.titre || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`
      : '';
  const detailPath = venteDetailPath || buildPropertyDetailsPath({
    reference: bien.reference,
    slug: bien.titre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    id: bien.id,
  });
  const imageUrls = bien.media && bien.media.length > 0
    ? bien.media.filter((m: any) => {
      if (m.type === 'video') return false;
      const motif = String(m.motif_upload || '');
      const isProof = motif === 'preuve_type_rue'
        || motif === 'preuve_type_papier'
        || motif.startsWith('preuve_type_rue|')
        || motif.startsWith('preuve_type_papier|');
      return !m.motif_upload || !isProof;
    }).map((m: any) => resolvePublicMediaUrl(m.url)).filter(Boolean)
    : [];
  const videoUrls = bien.media && bien.media.length > 0
    ? bien.media.filter((m: any) => m.type === 'video' && m.url).map((m: any) => resolvePublicMediaUrl(m.url)).filter(Boolean)
    : [];
  const fallbackImage = toYouTubeThumbnailUrl(videoUrls[0]) || PROPERTY_FALLBACK_IMAGE_DATA_URI;
  const seasonalRawConfig = bien.location_saisonniere_config || {};
  const seasonalMaxGuests = Number(
    (seasonalRawConfig as any)?.limite_personnes_nuit
    ?? (seasonalRawConfig as any)?.limitePersonnesNuit
    ?? (seasonalRawConfig as any)?.limite_personne_nuit
    ?? 0
  );
  const guestLimits = extractGuestLimitsFromCharacteristicLines(bien.caracteristiques);
  const cfgAdultsRaw = Number(bien.location_saisonniere_config?.max_adultes);
  const cfgChildrenRaw = Number(bien.location_saisonniere_config?.max_enfants);
  const hasFeatureSplitCaps = guestLimits.maxAdults !== null && guestLimits.maxChildren !== null;
  const hasConfigSplitCaps = Number.isFinite(cfgAdultsRaw) && cfgAdultsRaw > 0 && Number.isFinite(cfgChildrenRaw) && cfgChildrenRaw >= 0;
  const resolvedMaxAdults = hasFeatureSplitCaps
    ? Number(guestLimits.maxAdults)
    : (hasConfigSplitCaps ? Math.floor(cfgAdultsRaw) : null);
  const resolvedMaxChildren = hasFeatureSplitCaps
    ? Number(guestLimits.maxChildren)
    : (hasConfigSplitCaps ? Math.floor(cfgChildrenRaw) : null);
  const hasTotalGuestCap = Number.isFinite(seasonalMaxGuests) && seasonalMaxGuests > 0;
  const splitGuestMax =
    resolvedMaxAdults !== null && resolvedMaxChildren !== null
      ? Math.max(1, Number(resolvedMaxAdults) + Number(resolvedMaxChildren))
      : 0;
  const resolvedGuests = bien.mode === 'location_saisonniere'
    ? (hasTotalGuestCap
      ? Math.floor(seasonalMaxGuests)
      : (splitGuestMax > 0 ? splitGuestMax : Math.max(1, Number(bien.nb_chambres || 0) + 1)))
    : Math.max(1, Number(bien.nb_chambres || 0) + 1);
  const isCleaningAvailable = bien.location_saisonniere_config?.frais_menage_disponible
    ?? Number(bien.location_saisonniere_config?.frais_menage ?? 0) > 0;
  const isServiceAvailable = bien.location_saisonniere_config?.frais_service_disponible
    ?? Number(bien.location_saisonniere_config?.frais_service ?? 0) > 0;
  const seasonalCleaningFee = Number(bien.location_saisonniere_config?.frais_menage ?? 0);
  const seasonalServiceFee = Number(bien.location_saisonniere_config?.frais_service ?? 0);
  const normalizedConfiguration = String(bien.configuration || '').trim();
  const categoryFromType = typeToCategory[bien.type] || 'S+1';
  const mainTypeLabel = typeToMainLabel[bien.type] || categoryFromType;
  const normalizeLabelToken = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();
  const normalizedMainTypeLabel = normalizeLabelToken(mainTypeLabel);
  const normalizedConfigurationLabel = normalizeLabelToken(normalizedConfiguration);
  let resolvedCategory = categoryFromType;
  if (normalizedConfiguration) {
    const configurationAlreadyContainsType =
      normalizedConfigurationLabel.startsWith(normalizedMainTypeLabel)
      || normalizedConfigurationLabel.includes(normalizedMainTypeLabel);
    resolvedCategory = configurationAlreadyContainsType
      ? normalizedConfiguration
      : `${mainTypeLabel} ${normalizedConfiguration}`;
  } else if (bien.type === 'appartement' || bien.type === 'S1' || bien.type === 'S2' || bien.type === 'S3' || bien.type === 'S4') {
    resolvedCategory = categoryFromType;
  }

  return {
    id: bien.id,
    reference: bien.reference,
    title: bien.titre,
    slug: bien.titre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    detailPath,
    mode: bien.mode,
    location: zoneNames[bien.zone_id || ''] || 'KÃ©libia',
    pricePerNight: bien.prix_nuitee,
    pricePerWeek: bien.prix_semaine ?? null,
    priceContext: bien.mode === 'vente' ? 'sale' : 'night',
    rating: 4.5 + Math.random() * 0.5,
    reviews: Math.floor(Math.random() * 30) + 5,
    guests: resolvedGuests,
    bedrooms: bien.nb_chambres,
    bathrooms: bien.nb_salle_bain,
    images: imageUrls.length > 0 ? imageUrls : [fallbackImage],
    videos: videoUrls,
    description: bien.description || `Superbe ${bien.type}`,
    amenities: bien.caracteristiques && bien.caracteristiques.length > 0 ? bien.caracteristiques : getAmenitiesFromType(bien.type),
    category: resolvedCategory,
    isFeatured: bien.is_featured === true,
    unavailableDates: bien.unavailableDates || [],
    pricingPeriods: Array.isArray(bien.pricing_periods) ? bien.pricing_periods : [],
    cleaningFee: isCleaningAvailable && seasonalCleaningFee > 0 ? seasonalCleaningFee : 0,
    serviceFee: isServiceAvailable && seasonalServiceFee > 0 ? seasonalServiceFee : 0,
    seasonalConfig: {
      categorieStanding: bien.location_saisonniere_config?.categorie_standing ?? null,
      etage: bien.location_saisonniere_config?.etage ?? null,
      ascenseur: bien.location_saisonniere_config?.ascenseur ?? false,
      vue: bien.location_saisonniere_config?.vue ?? null,
      niveauSonore: bien.location_saisonniere_config?.niveau_sonore ?? null,
      accesGeneral: bien.location_saisonniere_config?.acces_general ?? null,
      dureeMinSejourNuits: bien.location_saisonniere_config?.duree_min_sejour_nuits ?? null,
      dureeMaxSejourNuits: bien.location_saisonniere_config?.duree_max_sejour_nuits ?? null,
      limitePersonnesNuit:
        (bien.location_saisonniere_config as any)?.limite_personnes_nuit
        ?? (bien.location_saisonniere_config as any)?.limitePersonnesNuit
        ?? (bien.location_saisonniere_config as any)?.limite_personne_nuit
        ?? null,
      maxAdultes: resolvedMaxAdults,
      maxEnfants: resolvedMaxChildren,
      politiqueAnnulation: bien.location_saisonniere_config?.politique_annulation ?? null,
      depotGarantie: bien.location_saisonniere_config?.depot_garantie ?? false,
      montantCaution: bien.location_saisonniere_config?.montant_caution ?? null,
      typeCaution: bien.location_saisonniere_config?.type_caution ?? null,
      checkinHeure: bien.location_saisonniere_config?.checkin_heure ?? null,
      checkoutHeure: bien.location_saisonniere_config?.checkout_heure ?? null,
      fumeurs: bien.location_saisonniere_config?.fumeurs ?? null,
      alcool: bien.location_saisonniere_config?.alcool ?? null,
      fetes: (bien.location_saisonniere_config as any)?.fetes ?? null,
      heuresSilence: (bien.location_saisonniere_config as any)?.heures_silence ?? null,
      animaux: bien.location_saisonniere_config?.animaux ?? null,
      matelasSupplementairePrix: bien.location_saisonniere_config?.matelas_supplementaire_prix ?? null,
      matelasSupplementairesMax: bien.location_saisonniere_config?.matelas_supplementaires_max ?? null,
      avancePourcentage: bien.location_saisonniere_config?.avance_pourcentage ?? 30,
      fraisMenageDisponible: isCleaningAvailable,
      fraisServiceDisponible: isServiceAvailable,
      servicesPayants: Array.isArray(bien.location_saisonniere_config?.services_payants) ? bien.location_saisonniere_config?.services_payants : [],
      produitsAccueilGratuits: bien.location_saisonniere_config?.produits_accueil_gratuits ?? true,
      fraisProduitsAccueil: bien.location_saisonniere_config?.frais_produits_accueil ?? null,
      climatisation:
        Boolean(bien.climatisation)
        || Boolean((bien.location_saisonniere_config as any)?.climatisation),
      terrasse:
        Boolean(bien.terrasse)
        || Boolean((bien.location_saisonniere_config as any)?.terrasse),
      vueMer:
        Boolean(bien.vue_mer)
        || Boolean((bien.location_saisonniere_config as any)?.vue_mer)
        || String((bien.location_saisonniere_config as any)?.vue || '').toLowerCase() === 'mer',
      prochePlage:
        Boolean(bien.proche_plage)
        || Boolean((bien.location_saisonniere_config as any)?.proche_plage),
      distancePlageM:
        bien.distance_plage_m
        ?? ((bien.location_saisonniere_config as any)?.distance_plage_m ?? null),
      exterieurJardin: Array.isArray((bien.location_saisonniere_config as any)?.exterieur_jardin)
        ? (bien.location_saisonniere_config as any).exterieur_jardin.map((item: any) => String(item || '').trim()).filter(Boolean)
        : [],
      confortEquipementsInterieurs: Array.isArray((bien.location_saisonniere_config as any)?.confort_equipements_interieurs)
        ? (bien.location_saisonniere_config as any).confort_equipements_interieurs.map((item: any) => String(item || '').trim()).filter(Boolean)
        : [],
    },
    proprietaire_id: bien.proprietaire_id || ''
  };
}

function getAmenitiesFromType(type: BienType): string[] {
  const baseAmenities = ['Wifi', 'Climatisation'];
  if (type === 'villa' || type === 'villa_maison' || type === 'bungalow') {
    return [...baseAmenities, 'Piscine', 'Jardin', 'Garage', 'Parking'];
  }
  if (type === 'studio' || type === 'S1' || type === 'appartement') {
    return [...baseAmenities, 'Kitchenette'];
  }
  if (type === 'local' || type === 'local_commercial') {
    return [...baseAmenities, 'Parking'];
  }
  return [...baseAmenities, 'Balcon', 'Vue sur mer'];
}

// ============================================
// CONTEXT TYPES
// ============================================

interface PropertiesContextType {
  biens: Bien[];
  properties: Property[];
  zones: Zone[];
  proprietaires: Proprietaire[];
  modePriorities: Record<BienMode, number>;
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  addBien: (newBien: Omit<Bien, 'id' | 'created_at' | 'updated_at'>) => Promise<string>;
  updateBien: (updatedBien: Bien) => Promise<any>;
  deleteBien: (id: string) => Promise<void>;
  saveModePriorities: (next: Record<BienMode, number>) => Promise<void>;
  getBienById: (id: string) => Bien | undefined;
  getPropertyById: (id: string) => Property | undefined;
  refreshData: () => Promise<void>;
}

const PropertiesContext = createContext<PropertiesContextType | undefined>(undefined);
const PROPERTIES_CACHE_KEY = 'dwira_properties_cache_v1';

type PropertiesCachePayload = {
  biens: Bien[];
  zones: Zone[];
  proprietaires: Proprietaire[];
  modePriorities: Record<BienMode, number>;
};

function readPropertiesCache(): PropertiesCachePayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PROPERTIES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      biens: Array.isArray(parsed.biens) ? parsed.biens : [],
      zones: Array.isArray(parsed.zones) ? parsed.zones : [],
      proprietaires: Array.isArray(parsed.proprietaires) ? parsed.proprietaires : [],
      modePriorities: parsed.modePriorities || DEFAULT_MODE_PRIORITIES,
    } as PropertiesCachePayload;
  } catch {
    return null;
  }
}

function writePropertiesCache(payload: PropertiesCachePayload) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PROPERTIES_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBiensResilient(apiUrl: string): Promise<Response> {
  const isIphone = typeof navigator !== 'undefined' && /iPhone/i.test(String(navigator.userAgent || ''));
  const endpointPrimary = `${apiUrl}/${isIphone ? 'biens-lite' : 'biens'}`;
  const endpointFallback = `${apiUrl}/biens`;
  const requestInit: RequestInit = { credentials: 'include', cache: 'no-store' };
  const primaryTimeoutMs = isIphone ? 7000 : 10000;
  try {
    return await fetchWithTimeout(endpointPrimary, requestInit, primaryTimeoutMs);
  } catch {
    try {
      return await fetchWithTimeout(endpointFallback, { credentials: 'include', cache: 'reload' }, 7000);
    } catch {
      // Final short fallback for Safari edge-cases without cookies.
      return await fetchWithTimeout(endpointFallback, { credentials: 'omit', cache: 'no-store' }, 7000);
    }
  }
}

// ============================================
// CONTEXT PROVIDER
// ============================================

export function PropertiesProvider({ children }: { children: ReactNode }) {
  const isDevMode = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
  const initialCache = readPropertiesCache();
  const [biens, setBiens] = useState<Bien[]>(initialCache?.biens || []);
  const [properties, setProperties] = useState<Property[]>(() => {
    const cachedBiens = initialCache?.biens || [];
    const cachedZones = initialCache?.zones || [];
    const zoneNameById: Record<string, string> = {};
    for (const zone of cachedZones) zoneNameById[zone.id] = zone.nom;
    return cachedBiens.filter((bien) => bien.visible_sur_site !== false).map((bien) => bienToProperty(bien, zoneNameById));
  });
  const [zones, setZones] = useState<Zone[]>(initialCache?.zones || []);
  const [proprietaires, setProprietaires] = useState<Proprietaire[]>(initialCache?.proprietaires || []);
  const [modePriorities, setModePriorities] = useState<Record<BienMode, number>>(initialCache?.modePriorities || DEFAULT_MODE_PRIORITIES);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(null);

  const applyMappedBiens = (
    mappedBiens: Bien[],
    zonesData: Zone[],
    propsData: Proprietaire[],
    modePrioritiesData: any
  ) => {
    const zoneNameById: Record<string, string> = {};
    for (const zone of Array.isArray(zonesData) ? zonesData : []) {
      zoneNameById[zone.id] = zone.nom;
    }

    setBiens(mappedBiens);
    setProperties(mappedBiens.filter((bien) => bien.visible_sur_site !== false).map((bien) => bienToProperty(bien, zoneNameById)));
    setZones(Array.isArray(zonesData) ? zonesData : []);
    setProprietaires(Array.isArray(propsData) ? propsData : []);
    setModePriorities({
      location_saisonniere: Number(modePrioritiesData?.location_saisonniere || DEFAULT_MODE_PRIORITIES.location_saisonniere),
      vente: Number(modePrioritiesData?.vente || DEFAULT_MODE_PRIORITIES.vente),
      location_annuelle: Number(modePrioritiesData?.location_annuelle || DEFAULT_MODE_PRIORITIES.location_annuelle),
    });
    writePropertiesCache({
      biens: mappedBiens,
      zones: Array.isArray(zonesData) ? zonesData : [],
      proprietaires: Array.isArray(propsData) ? propsData : [],
      modePriorities: {
        location_saisonniere: Number(modePrioritiesData?.location_saisonniere || DEFAULT_MODE_PRIORITIES.location_saisonniere),
        vente: Number(modePrioritiesData?.vente || DEFAULT_MODE_PRIORITIES.vente),
        location_annuelle: Number(modePrioritiesData?.location_annuelle || DEFAULT_MODE_PRIORITIES.location_annuelle),
      },
    });
  };

  // Fetch data from API
  const fetchData = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
      const [biensResponse, zonesResponse, modePrioritiesResponse, propsResponse] = await Promise.all([
        fetchBiensResilient(API_URL),
        fetchWithTimeout(`${API_URL}/zones`, { credentials: 'include' }, 8000),
        fetchWithTimeout(`${API_URL}/site-mode-priorities`, { credentials: 'include' }, 8000),
        isAdminRoute
          ? fetchWithTimeout(`${API_URL}/proprietaires`, { credentials: 'include' }, 10000).catch((error) => {
              console.warn('Failed to fetch proprietaires during refresh:', error?.message || error);
              return null;
            })
          : Promise.resolve(null),
      ]);
      if (!biensResponse.ok) throw new Error('Failed to fetch biens');
      const biensData = await biensResponse.json();
      const zonesData = zonesResponse.ok ? await zonesResponse.json() : [];
      const propsData = propsResponse?.ok ? await propsResponse.json() : [];
      const modePrioritiesData = modePrioritiesResponse.ok ? await modePrioritiesResponse.json() : null;

      const bienIds = Array.isArray(biensData) ? biensData.map((bien: any) => String(bien?.id || '').trim()).filter(Boolean) : [];
      let allMedia: any[] = [];
      try {
        const bulkMediaResponse = await fetchWithTimeout(
          `${API_URL}/media-bulk?bien_ids=${encodeURIComponent(bienIds.join(','))}`,
          { credentials: 'include' },
          7000
        );
        if (bulkMediaResponse.ok) {
          allMedia = await bulkMediaResponse.json();
        }
      } catch (e) {
        console.warn('Failed to fetch bulk media');
      }

      const mediaByBienId = new Map<string, any[]>();
      for (const item of Array.isArray(allMedia) ? allMedia : []) {
        const bienId = String(item?.bien_id || '').trim();
        if (!bienId) continue;
        const list = mediaByBienId.get(bienId) || [];
        list.push(item);
        mediaByBienId.set(bienId, list);
      }

      const mappedBiens = (Array.isArray(biensData) ? biensData : []).map((bien: any) =>
        dbRowToBien(bien, mediaByBienId.get(String(bien?.id || '').trim()) || [], [])
      );

      applyMappedBiens(mappedBiens, zonesData, propsData, modePrioritiesData);
      if (!silent) {
        setLoading(false);
      }

      // Fetch unavailable dates after the homepage and lists are already usable.
      // Limit eager prefetch to reduce initial network pressure.
      void (async () => {
        const datesByBienId = new Map<string, any[]>();
        const eagerUnavailableDateIds = mappedBiens
          .filter((bien) => bien.visible_sur_site !== false)
          .slice(0, 10)
          .map((bien) => String(bien.id || '').trim())
          .filter(Boolean);
        await Promise.all(
          eagerUnavailableDateIds.map(async (bienId) => {
            try {
              const datesResponse = await fetchWithTimeout(`${API_URL}/unavailable-dates/${bienId}`, { credentials: 'include' }, 5000);
              if (!datesResponse.ok) return;
              const rows = await datesResponse.json();
              datesByBienId.set(bienId, Array.isArray(rows) ? rows : []);
            } catch {
              console.warn(`Failed to fetch unavailable dates for bien ${bienId}`);
            }
          })
        );

        const nextMappedBiens = (Array.isArray(biensData) ? biensData : []).map((bien: any) =>
          dbRowToBien(
            bien,
            mediaByBienId.get(String(bien?.id || '').trim()) || [],
            datesByBienId.get(String(bien?.id || '').trim()) || []
          )
        );

        applyMappedBiens(nextMappedBiens, zonesData, propsData, modePrioritiesData);
      })();
      return;
    } catch (err: any) {
      console.warn('API unavailable:', err?.message || err);
      if (!silent) {
        setLoading(false);
      }
      if (initialCache?.biens?.length) {
        setBiens(initialCache.biens);
        const zoneNameById: Record<string, string> = {};
        for (const zone of initialCache.zones || []) zoneNameById[zone.id] = zone.nom;
        setProperties(
          initialCache.biens
            .filter((bien) => bien.visible_sur_site !== false)
            .map((bien) => bienToProperty(bien, zoneNameById))
        );
        setZones(initialCache.zones || []);
        setProprietaires(initialCache.proprietaires || []);
        setModePriorities(initialCache.modePriorities || DEFAULT_MODE_PRIORITIES);
      }
      // In production, do not replace DB-backed data with mock content.
      if (!isDevMode) {
        setError('Impossible de charger les biens depuis la base pour le moment.');
        return;
      }

      console.warn('DEV mode fallback: using local mock data');
      const localModule = await import('../data/properties');
      const localProperties = localModule.properties;
      const localBiens: Bien[] = localProperties.map((p: Property) => ({
        id: p.id,
        reference: p.id,
        titre: p.title,
        description: p.description,
        mode: 'location_saisonniere',
        type: p.category === 'Studio' ? 'studio' : p.category === 'Villa' ? 'villa_maison' : 'appartement',
        nb_chambres: p.bedrooms,
        nb_salle_bain: p.bathrooms,
        prix_nuitee: p.pricePerNight,
        prix_semaine: p.pricePerWeek ?? null,
        tarification_methode: null,
        prix_affiche_client: null,
        prix_fixe_proprietaire: null,
        prix_proprietaire: null,
        prix_final: null,
        revenu_agence: null,
        commission_pourcentage_proprietaire: 3,
        commission_pourcentage_client: 2,
        montant_max_reduction_negociation: null,
        prix_minimum_accepte: null,
        modalite_paiement_vente: null,
        pourcentage_premiere_partie_promesse: null,
        montant_premiere_partie_promesse: null,
        montant_deuxieme_partie: null,
        nombre_tranches: null,
        periode_tranches_mois: null,
        montant_par_tranche: null,
        avance: p.cleaningFee || 0,
        caution: 0,
        type_rue: null,
        type_papier: null,
        superficie_m2: null,
        etage: null,
        configuration: null,
        annee_construction: null,
        distance_plage_m: null,
        proche_plage: false,
        chauffage_central: false,
        climatisation: false,
        balcon: false,
        terrasse: false,
        ascenseur: false,
        vue_mer: false,
        gaz_ville: false,
        cuisine_equipee: false,
        place_parking: false,
        syndic: false,
        meuble: false,
        independant: false,
        eau_puits: false,
        eau_sonede: false,
        electricite_steg: false,
        surface_local_m2: null,
        facade_m: null,
        hauteur_plafond_m: null,
        activite_recommandee: null,
        toilette: false,
        reserve_local: false,
        vitrine: false,
        coin_angle: false,
        electricite_3_phases: false,
        alarme: false,
        type_terrain: null,
        terrain_facade_m: null,
        terrain_surface_m2: null,
        terrain_distance_plage_m: null,
        terrain_zone: null,
        terrain_constructible: false,
        terrain_angle: false,
        immeuble_surface_terrain_m2: null,
        immeuble_surface_batie_m2: null,
        immeuble_nb_niveaux: null,
        immeuble_nb_garages: null,
        immeuble_nb_appartements: null,
        immeuble_nb_locaux_commerciaux: null,
        immeuble_distance_plage_m: null,
        immeuble_proche_plage: false,
        immeuble_ascenseur: false,
        immeuble_parking_sous_sol: false,
        immeuble_parking_exterieur: false,
        immeuble_syndic: false,
        immeuble_vue_mer: false,
        immeuble_appartements: [],
        statut: 'disponible' as BienStatut,
        visible_sur_site: true,
        is_featured: !!p.isFeatured,
        ui_config: null,
        menage_en_cours: false,
        zone_id: 'z1',
        proprietaire_id: p.proprietaire_id || '',
        date_ajout: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        media: (p.images || []).map((url, idx) => ({
          id: `local-media-${p.id}-${idx}`,
          bien_id: p.id,
          type: 'image',
          url,
          position: idx
        })),
        unavailableDates: p.unavailableDates?.map(ud => ({
          start: ud.start,
          end: ud.end,
          status: ud.status,
          color: ud.status === 'booked' ? '#ef4444' : ud.status === 'pending' ? '#f97316' : '#111827'
        })) || [],
        pricing_periods: p.pricingPeriods || []
      }));

      setBiens(localBiens);
      setProperties(localProperties);
      setZones([
        { id: 'z1', nom: 'KÃ©libia Centre', description: 'Centre ville de KÃ©libia' },
        { id: 'z2', nom: 'El Mansoura', description: 'Quartier El Mansoura' },
        { id: 'z3', nom: 'Petit Paris', description: 'Quartier Petit Paris' }
      ]);
      setProprietaires([
        { id: 'p1', nom: 'PropriÃ©taire 1', telephone: '', email: '', cin: '' },
        { id: 'p2', nom: 'PropriÃ©taire 2', telephone: '', email: '', cin: '' },
        { id: 'p3', nom: 'PropriÃ©taire 3', telephone: '', email: '', cin: '' }
      ]);
      setModePriorities(DEFAULT_MODE_PRIORITIES);
      setError(null);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // CRUD Operations
  const addBien = async (newBien: Omit<Bien, 'id' | 'created_at' | 'updated_at'>): Promise<string> => {
    try {
      const response = await fetch(`${API_URL}/biens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newBien)
      });
      
      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Creation du bien impossible');
        throw new Error(message);
      }

      const createdBien = await response.json();
      await fetchData({ silent: true }); // Refresh data
      return String(createdBien?.id || '');
    } catch (err: any) {
      console.error('Error creating bien:', err);
      throw err;
    }
  };

  const updateBien = async (updatedBien: Bien) => {
    try {
      const response = await fetch(`${API_URL}/biens/${updatedBien.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updatedBien)
      });
      
      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Mise a jour du bien impossible');
        throw new Error(message);
      }
      const data = await response.json().catch(() => null);
      await fetchData({ silent: true }); // Refresh data
      return data;
    } catch (err: any) {
      console.error('Error updating bien:', err);
      throw err;
    }
  };

  const deleteBien = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/biens/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Suppression du bien impossible'));
      
      await fetchData({ silent: true }); // Refresh data
    } catch (err: any) {
      console.error('Error deleting bien:', err);
      throw err;
    }
  };

  const saveModePriorities = async (next: Record<BienMode, number>) => {
    const response = await fetch(`${API_URL}/site-mode-priorities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(next),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Mise a jour des priorites impossible'));
    }
    const data = await response.json().catch(() => null);
    setModePriorities({
      location_saisonniere: Number(data?.location_saisonniere || next.location_saisonniere || DEFAULT_MODE_PRIORITIES.location_saisonniere),
      vente: Number(data?.vente || next.vente || DEFAULT_MODE_PRIORITIES.vente),
      location_annuelle: Number(data?.location_annuelle || next.location_annuelle || DEFAULT_MODE_PRIORITIES.location_annuelle),
    });
  };

  const getBienById = (id: string) => {
    return biens.find(b => b.id === id);
  };

  const getPropertyById = (id: string) => {
    return properties.find(p => p.id === id);
  };

  const refreshData = async () => {
    await fetchData({ silent: true });
  };

  const value: PropertiesContextType = {
    biens,
    properties,
    zones,
    proprietaires,
    modePriorities,
    loading,
    isLoading: loading,
    error,
    addBien,
    updateBien,
    deleteBien,
    saveModePriorities,
    getBienById,
    getPropertyById,
    refreshData
  };

  return (
    <PropertiesContext.Provider value={value}>
      {children}
    </PropertiesContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useProperties() {
  const context = useContext(PropertiesContext);
  if (context === undefined) {
    throw new Error('useProperties must be used within a PropertiesProvider');
  }
  return context;
}

export { bienToProperty };

