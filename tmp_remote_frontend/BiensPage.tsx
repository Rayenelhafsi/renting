import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Eye, MapPin, Home, Banknote, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Check, Calendar as CalendarIcon, Image as ImageIcon, Bed, Bath, Maximize, Sofa, ArrowLeft, Trash, Save, GripVertical, Upload, AlertCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { mockZones } from '../data/mockData';
import { Bien, BienStatut, Media, DateStatus, BienType, BienMode, Zone, Proprietaire, Caracteristique, TypeRueAppartementVente, TypePapierAppartementVente, TypeTerrainVente, TarificationMethodeVente, ModalitePaiementVente, ModeAffichagePrixTerrain, ModePrixLotissement, BienUiConfig, LocationSaisonniereConfig, SeasonalPricingPeriod, ServicePayantBien } from '../types';
import * as Dialog from '@radix-ui/react-dialog';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, addMonths, subMonths, startOfWeek, endOfWeek, isWithinInterval, parseISO, isBefore, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { useProperties } from '../../context/PropertiesContext';
import PublicBienPageView from '../../ventes/components/PublicBienPageView';
import LocationPublicBienPageView from '../../locations/components/LocationPublicBienPageView';
import { SmartImage } from '../../components/SmartImage';
import { FEATURE_ICON_OPTIONS, getFeatureIconElement } from '../../utils/featureIcons';
import { getServiceTarificationLabel, normalizeServicePayant } from '../../utils/servicePayants';
import { canRenderVideoInIframe, isFacebookVideoUrl, isSupportedVideoUrl, toVideoEmbedUrl, toVideoExternalUrl, toYouTubeThumbnailUrl } from '../../utils/videoLinks';
import { deriveBedroomsFromConfiguration, extractCapacityFromEntries } from '../../utils/bienCapacity';
import { resolveCurrentPricing } from '../../utils/seasonalPricing';
import { fetchAmicalesAdmin } from '../../utils/amicales';
import locationSaisonniereServicesData from '../../data/locationSaisonniereServices.json';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const ADMIN_IMAGE_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23e5e7eb'/%3E%3Cpath d='M170 240l92-90 64 64 54-54 90 80H170z' fill='%23cbd5e1'/%3E%3Ccircle cx='250' cy='126' r='30' fill='%23cbd5e1'/%3E%3C/svg%3E";
const LOCATION_SAISONNIERE_SERVICES_CATALOGUE_FALLBACK = (locationSaisonniereServicesData as ServicePayantBien[]).map((service) =>
  normalizeServicePayant(service)
);
const buildDefaultPaidServices = (services: ServicePayantBien[] = LOCATION_SAISONNIERE_SERVICES_CATALOGUE_FALLBACK) =>
  services.map((service) => normalizeServicePayant(service));

const resolveMediaUrl = (url?: string | null) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base = /^https?:\/\//i.test(API_URL)
    ? API_URL
    : (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : window.location.origin);
  const origin = new URL(base, window.location.origin).origin;
  if (value.startsWith('/')) return `${origin}${value}`;
  return value;
};

const renderFeatureIconPreview = (
  iconName?: string | null,
  featureName?: string | null,
  options?: { onClick?: () => void; expanded?: boolean }
) => {
  const content = (
    <>
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm">
        {getFeatureIconElement(iconName, featureName, null)}
      </span>
      <span>{String(featureName || '').trim() || 'Apercu icone'}</span>
      {options?.onClick && (
        <span className="text-[11px] text-emerald-700/80">
          {options.expanded ? 'Masquer' : 'Modifier'}
        </span>
      )}
    </>
  );

  if (options?.onClick) {
    return (
      <button
        type="button"
        onClick={options.onClick}
        className="inline-flex w-full items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100/70"
      >
        {content}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
      {content}
    </span>
  );
};

const renderFeatureIconPicker = (
  selectedIconName: string,
  featureName: string,
  onSelect: (iconName: string) => void
) => (
  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {renderFeatureIconPreview(selectedIconName, featureName)}
      <span className="text-xs text-emerald-800">Choisir une icone</span>
    </div>
    <div className="max-h-72 overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
      {FEATURE_ICON_OPTIONS.map((option) => {
        const isActive = option.value === selectedIconName;
        return (
          <button
            key={option.value || 'auto'}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
              isActive
                ? 'border-emerald-500 bg-white text-emerald-900 shadow-sm'
                : 'border-emerald-100 bg-white/80 text-gray-700 hover:border-emerald-300 hover:bg-white'
            }`}
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50">
              {getFeatureIconElement(option.value, featureName, null)}
            </span>
            <span className="leading-tight">{option.label}</span>
          </button>
        );
      })}
      </div>
    </div>
  </div>
);

const statusColors: Record<BienStatut, string> = { disponible: "bg-emerald-100 text-emerald-800 border-emerald-200", loue: "bg-blue-100 text-blue-800 border-blue-200", reserve: "bg-amber-100 text-amber-800 border-amber-200", maintenance: "bg-red-100 text-red-800 border-red-200", bloque: "bg-gray-200 text-gray-800 border-gray-300" };
const statusLabels: Record<BienStatut, string> = { disponible: "Disponible", loue: "LouÃ©", reserve: "RÃ©servÃ©", maintenance: "Maintenance", bloque: "BloquÃ©" };
const modeLabels: Record<BienMode, string> = {
  vente: "Vente",
  location_annuelle: "Location annuelle",
  location_saisonniere: "Location saisonniere",
};
const typeLabels: Record<BienType, string> = {
  appartement: "Appartement",
  villa_maison: "Villa/Maison",
  studio: "Studio",
  immeuble: "Immeuble",
  terrain: "Terrain",
  lotissement: "Lotissement",
  local_commercial: "Local commercial",
  bungalow: "Bungalow",
  S1: "Appartement",
  S2: "Appartement",
  S3: "Appartement",
  S4: "Appartement",
  villa: "Villa/Maison",
  local: "Local commercial",
};
const BIEN_TYPES_BY_MODE: Record<BienMode, BienType[]> = {
  vente: ['appartement', 'villa_maison', 'studio', 'immeuble', 'terrain', 'lotissement', 'local_commercial'],
  location_saisonniere: ['appartement', 'villa_maison', 'bungalow', 'studio'],
  location_annuelle: ['appartement', 'local_commercial', 'villa_maison'],
};
const TERRAIN_PRIX_MODE_LABELS: Record<ModeAffichagePrixTerrain, string> = {
  total_uniquement: 'Total uniquement',
  m2_uniquement: 'Prix / m2 uniquement',
  total_et_m2: 'Total et prix / m2',
};
const LOTISSEMENT_PRIX_MODE_LABELS: Record<ModePrixLotissement, string> = {
  m2_unique: 'Prix / m2 unique',
  paliers: 'Paliers selon surface',
};
const TYPE_RUE_LABELS: Record<TypeRueAppartementVente, string> = {
  piste: 'Piste',
  route_goudronnee: 'Route goudronnÃ©e',
  rue_residentielle: 'Rue rÃ©sidentielle',
};
const TYPE_PAPIER_LABELS: Record<TypePapierAppartementVente, string> = {
  titre_foncier_individuel: 'Titre foncier individuel',
  titre_foncier_collectif: 'Titre foncier collectif',
  contrat_seulement: 'Contrat seulement',
  sans_papier: 'Sans papier',
};
const TYPE_TERRAIN_LABELS: Record<TypeTerrainVente, string> = {
  agricole: 'Agricole',
  habitation: 'Habitation',
  industrielle: 'Industrielle',
  loisir: 'Loisir',
};
const normalizeLegacyType = (value?: BienType): BienType => {
  if (value === 'S1' || value === 'S2' || value === 'S3' || value === 'S4') return 'appartement';
  if (value === 'villa') return 'villa_maison';
  if (value === 'local') return 'local_commercial';
  return (value || 'appartement') as BienType;
};
const toNonNegativeIntegerOrNull = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
};
const extractGoogleMapsLatLng = (raw?: string | null): { lat: number; lng: number } | null => {
  const value = String(raw || '').trim();
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const isLngLatPattern = pattern.source.startsWith('!2d');
    const lat = Number(isLngLatPattern ? match[2] : match[1]);
    const lng = Number(isLngLatPattern ? match[1] : match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return null;
};
const TERRAIN_SECTION_TABS = [
  { id: 'informations_generales', label: '1. Informations generales' },
  { id: 'dimensions_forme', label: '2. Dimensions & forme' },
  { id: 'situation_juridique', label: '3. Situation juridique' },
  { id: 'acces_environnement', label: '4. Acces & environnement' },
  { id: 'viabilisation', label: '5. Viabilisation' },
  { id: 'environnement_naturel', label: '6. Environnement naturel' },
  { id: 'ideal_utilisation', label: '7. Ideal pour' },
  { id: 'documents_disponibles', label: '8. Documents disponibles' },
] as const;
const UI_SECTION_FEATURE_TAB_DEFINITIONS: Partial<Record<keyof BienUiConfig, { label: string; ordre: number }>> = {
  show_informations_generales: { label: 'Informations generales', ordre: 20 },
  show_caracteristiques: { label: 'Caracteristiques', ordre: 30 },
  show_immeuble_appartements: { label: 'Bloc appartements', ordre: 60 },
  show_immeuble_garages: { label: 'Bloc garages', ordre: 70 },
  show_immeuble_locaux_commerciaux: { label: 'Bloc locaux commerciaux', ordre: 80 },
  show_lotissement_terrains: { label: 'Bloc terrains du lotissement', ordre: 90 },
};
const UI_SECTION_OPTIONS_LOCATION: Array<{ key: keyof BienUiConfig; label: string }> = [
  { key: 'show_informations_generales', label: 'Informations generales' },
  { key: 'show_caracteristiques', label: 'Caracteristiques' },
  { key: 'show_localisation', label: 'Localisation & acces' },
  { key: 'show_booking_card', label: 'Carte reservation' },
];
const UI_SECTION_OPTIONS_VENTE: Array<{ key: keyof BienUiConfig; label: string }> = [
  { key: 'show_informations_generales', label: 'Informations generales' },
  { key: 'show_caracteristiques', label: 'Caracteristiques' },
];
const REMOVED_ADMIN_TAB_LABEL_TOKENS = [
  'galerie',
  'tarification publique',
  'modalite de paiement',
  'modalites de paiement',
  'disponibilites calendrier',
  'exterieur loisirs',
  'maintenance exploitation',
  'mainetenance exploitation',
  'notes scoring',
  'services inclut',
  'services inclus',
  'tech divertisement',
  'tech divertissement',
];
const normalizeAdminTabLabel = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const isRemovedAdminTabLabel = (label?: string | null) => {
  const normalized = normalizeAdminTabLabel(label);
  if (!normalized) return false;
  return REMOVED_ADMIN_TAB_LABEL_TOKENS.some((token) => normalized.includes(token));
};
type TerrainSectionTab = string;
type CaracteristiqueOnglet = {
  id: string;
  nom: string;
  ordre?: number;
  is_system?: number | boolean;
};
const DEFAULT_DETAILS_TABS: CaracteristiqueOnglet[] = [
  { id: 'informations_generales', nom: 'Informations generales', ordre: 20, is_system: 1 },
  { id: 'caracteristiques', nom: 'Caracteristiques', ordre: 30, is_system: 1 },
];
type ValidationIssue = {
  step: 1 | 2 | 3 | 4 | 5;
  fieldName: string;
  label: string;
  message: string;
};
type LinkedBienPreview = {
  id: string;
  reference?: string | null;
  titre?: string | null;
  mode?: BienMode | string | null;
  type?: BienType | string | null;
};
type DeleteRelationDialogState = {
  open: boolean;
  sourceId: string;
  sourceLabel: string;
  linkedBiens: LinkedBienPreview[];
  targetId: string;
  loading: boolean;
  submitting: boolean;
};
type PendingFeatureAddition = {
  nom: string;
  mode_bien: BienMode;
  type_bien: BienType;
  type_caracteristique: 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte';
  choix: string[];
  unite: string | null;
  icon_name: string | null;
  onglet_id: string | null;
  visibilite_client: 0 | 1;
};
type FeatureExistsDialogState = {
  open: boolean;
  featureName: string;
  mode: BienMode;
  type: BienType;
  canAddToCurrentContext: boolean;
  payload: PendingFeatureAddition | null;
};
const TERRAIN_HAUTEUR_OPTIONS = ['R+1', 'R+2', 'R+3', 'R+4', 'R+5'];
const TERRAIN_FORME_OPTIONS = ['rectangulaire', 'irreguliere', 'carre', 'triangle', 'autre'];
const TERRAIN_TOPOGRAPHIE_OPTIONS = [
  { value: 'plat', label: 'Plat' },
  { value: 'en_pente', label: 'En pente' },
];
const TERRAIN_VOISINAGE_OPTIONS = [
  { value: 'residentiel_calme', label: 'Residentiel calme' },
  { value: 'touristique_anime', label: 'Touristique anime' },
  { value: 'agricole', label: 'Agricole' },
];
const TERRAIN_TYPE_SOL_OPTIONS = [
  { value: 'sablonneux', label: 'Sablonneux' },
  { value: 'rocheux', label: 'Rocheux' },
  { value: 'terre_agricole', label: 'Terre agricole' },
];
const TERRAIN_NIVEAU_SONORE_OPTIONS = [
  { value: 'faible', label: 'Faible' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'eleve', label: 'Eleve' },
];
const SAISON_STANDING_OPTIONS = [
  { value: 'economique', label: 'Economique' },
  { value: 'confort', label: 'Confort' },
  { value: 'premium', label: 'Premium' },
  { value: 'luxe', label: 'Luxe' },
] as const;
const SAISON_ETAGE_OPTIONS = [
  { value: 'rdc', label: 'RDC' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5_plus', label: '5+' },
] as const;
const SAISON_VUE_OPTIONS = [
  { value: 'mer', label: 'Vue mer' },
  { value: 'jardin', label: 'Vue jardin' },
  { value: 'ville', label: 'Vue ville' },
  { value: 'montagne', label: 'Vue montagne' },
  { value: 'sans_vue', label: 'Sans vue particuliere' },
] as const;
const SAISON_NIVEAU_SONORE_OPTIONS = [
  { value: 'tres_calme', label: 'Tres calme' },
  { value: 'calme', label: 'Calme' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'bruyant', label: 'Bruyant' },
] as const;
const SAISON_ACCES_OPTIONS = [
  { value: 'tres_facile', label: 'Tres facile' },
  { value: 'facile', label: 'Facile' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'difficile', label: 'Difficile' },
] as const;
const SAISON_POLITIQUE_ANNULATION_OPTIONS = [
  { value: 'flexible', label: 'Flexible' },
  { value: 'moderee', label: 'Moderee' },
  { value: 'stricte', label: 'Stricte' },
  { value: 'non_remboursable', label: 'Non remboursable' },
] as const;
const SAISON_TYPE_CAUTION_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'preautorisation', label: 'Pre-autorisation' },
  { value: 'virement', label: 'Virement' },
  { value: 'aucune', label: 'Aucune' },
] as const;
const SAISON_FUMEURS_OPTIONS = [
  { value: 'autorise', label: 'Autorise' },
  { value: 'interdit', label: 'Interdit' },
  { value: 'balcon_terrasse', label: 'Autorise sur balcon/terrasse' },
] as const;
const SAISON_ALCOOL_OPTIONS = [
  { value: 'autorise', label: 'Autorise' },
  { value: 'interdit', label: 'Interdit' },
] as const;
const SAISON_FETES_OPTIONS = [
  { value: 'autorise', label: 'Autorise' },
  { value: 'interdit', label: 'Interdit' },
] as const;
const SAISON_HEURES_SILENCE_OPTIONS = Array.from({ length: 24 }, (_, idx) => {
  const hour = idx === 0 ? 12 : (idx > 12 ? idx - 12 : idx);
  const meridiem = idx < 12 ? 'AM' : 'PM';
  return { value: `${hour}${meridiem.toLowerCase()}`, label: `${hour} ${meridiem}` };
});
const SAISON_ANIMAUX_OPTIONS = [
  { value: 'autorises', label: 'Autorises' },
  { value: 'interdits', label: 'Interdits' },
  { value: 'sous_conditions', label: 'Autorises sous conditions' },
] as const;
const DEFAULT_LOCATION_SAISONNIERE_CONFIG: LocationSaisonniereConfig = {
  categorie_standing: 'confort',
  etage: 'rdc',
  ascenseur: false,
  vue: 'sans_vue',
  niveau_sonore: 'calme',
  acces_general: 'facile',
  limite_personnes_nuit: 2,
  max_adultes: 2,
  max_enfants: 0,
  duree_min_sejour_nuits: 1,
  duree_max_sejour_nuits: 30,
  politique_annulation: 'moderee',
  depot_garantie: false,
  montant_caution: 0,
  type_caution: 'aucune',
  checkin_heure: '14:00',
  checkout_heure: '11:00',
  fumeurs: 'interdit',
  alcool: 'autorise',
  fetes: 'interdit',
  heures_silence: '1am',
  animaux: 'interdits',
  produits_accueil_gratuits: true,
  frais_produits_accueil: 0,
  matelas_supplementaire_prix: 25,
  matelas_supplementaires_max: 3,
  avance_pourcentage: 30,
  frais_menage_disponible: false,
  frais_menage: 0,
  frais_service_disponible: false,
  frais_service: 0,
  services_payants: buildDefaultPaidServices(),
  google_maps_embed_url: null,
};
const TERRAIN_ONAS_OPTIONS = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'en_facade', label: 'En facade' },
  { value: 'non_disponible', label: 'Non disponible' },
];
const TERRAIN_STEG_OPTIONS = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'a_proximite', label: 'A proximite' },
  { value: 'transformateur_proche', label: 'Transformateur proche' },
  { value: 'non_disponible', label: 'Non disponible' },
];
const TERRAIN_MULTI_OPTIONS = {
  disponibiliteReseaux: [
    { value: 'eau', label: 'Eau' },
    { value: 'electricite', label: 'Electricite' },
    { value: 'onas', label: 'ONAS' },
  ],
  proximites: [
    { value: 'ecole', label: 'Ecole' },
    { value: 'commerce', label: 'Commerce' },
    { value: 'transport', label: 'Transport' },
    { value: 'centre_ville', label: 'Centre-ville' },
  ],
  eauSources: [
    { value: 'sonede', label: 'SONEDE' },
    { value: 'puits', label: 'Puits' },
    { value: 'citerne', label: 'Citerne' },
  ],
  idealUtilisations: [
    { value: 'construction_villa', label: 'Construction villa' },
    { value: 'construction_immeuble', label: 'Construction immeuble' },
    { value: 'projet_touristique', label: 'Projet touristique' },
    { value: 'projet_commercial', label: 'Projet commercial' },
    { value: 'projet_agricole', label: 'Projet agricole' },
    { value: 'investissement_longue_duree', label: 'Investissement longue duree' },
  ],
  documents: [
    { value: 'plan_masse', label: 'Plan de masse' },
    { value: 'plan_topographique', label: 'Plan topographique' },
    { value: 'certificat_propriete', label: 'Certificat de propriete' },
    { value: 'certificat_bornage', label: 'Certificat de bornage' },
    { value: 'certificat_conformite_municipal', label: 'Certificat conformite municipal' },
    { value: 'certificat_non_affectation_agricole', label: 'Certificat non-affectation agricole' },
  ],
} as const;
const APPARTEMENT_VENTE_BOOLEAN_FIELDS = [
  'proche_plage', 'chauffage_central', 'climatisation', 'balcon', 'terrasse', 'ascenseur', 'vue_mer',
  'gaz_ville', 'cuisine_equipee', 'place_parking', 'syndic', 'meuble', 'independant', 'eau_puits',
  'eau_sonede', 'electricite_steg'
] as const;
const APPARTEMENT_VENTE_BOOLEAN_LABELS: Record<(typeof APPARTEMENT_VENTE_BOOLEAN_FIELDS)[number], string> = {
  proche_plage: 'Proche de la plage',
  chauffage_central: 'Chauffage central',
  climatisation: 'Climatisation',
  balcon: 'Balcon',
  terrasse: 'Terrasse',
  ascenseur: 'Ascenseur',
  vue_mer: 'Vue mer',
  gaz_ville: 'Gaz de ville',
  cuisine_equipee: 'Cuisine equipee',
  place_parking: 'Place parking',
  syndic: 'Syndic',
  meuble: 'MeublÃ©',
  independant: 'IndÃ©pendant',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Ã‰lectricitÃ© STEG',
};
const normalizeFeatureName = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const isLegacyNightLimitFeature = (featureName: string) => {
  const normalized = normalizeFeatureName(String(featureName || ''));
  return normalized.startsWith('limite personnes')
    && normalized.includes('nuit');
};
const normalizeTabNameForMatch = (value: string) =>
  normalizeFeatureName(String(value || '').replace(/^\s*\d+\s*[\.\-:)]\s*/g, ''));
const parseFeatureChoices = (value: string) =>
  Array.from(new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean)));
const normalizeFeatureType = (value?: string | null): 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte' => {
  if (value === 'valeur') return 'valeur';
  if (value === 'choix_multiple') return 'choix_multiple';
  if (value === 'plusieurs_choix') return 'plusieurs_choix';
  if (value === 'texte') return 'texte';
  return 'simple';
};
type SelectedFeatureEntry = {
  name: string;
  value: string | number | null;
  tabLabel?: string;
};
const splitFeatureFragments = (entry: SelectedFeatureEntry) =>
  Array.from(
    new Set(
      [
        String(entry.name || '').trim(),
        ...String(entry.value || '')
          .split(',')
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ].filter(Boolean)
    )
  );
const deriveSeasonFilterSignalsFromFeatures = (entries: SelectedFeatureEntry[]) => {
  const exteriorValues: string[] = [];
  const interiorValues: string[] = [];
  const tokenBag = new Set<string>();
  const exteriorHints = ['exterieur', 'jardin', 'caracteristique'];
  const interiorHints = ['confort', 'equipement', 'interieur'];

  for (const entry of entries) {
    const tabNorm = normalizeFeatureName(String(entry.tabLabel || ''));
    const fragments = splitFeatureFragments(entry);
    fragments.forEach((fragment) => tokenBag.add(normalizeFeatureName(fragment)));
    const isExterior = exteriorHints.some((hint) => tabNorm.includes(hint));
    const isInterior = interiorHints.some((hint) => tabNorm.includes(hint));
    if (isExterior) exteriorValues.push(...fragments);
    if (isInterior) interiorValues.push(...fragments);
  }

  const hasToken = (...tokens: string[]) => {
    const normalizedTokens = tokens.map((token) => normalizeFeatureName(token));
    return Array.from(tokenBag).some((candidate) =>
      normalizedTokens.some((token) => candidate.includes(token))
    );
  };

  const hasPiedDansEau = hasToken('pied dans l eau', 'front de mer', 'bord de mer', 'acces direct plage');
  const hasVueMer = hasToken('vue mer', 'vue sur mer') || hasPiedDansEau;
  const hasProchePlage = hasToken('proche plage', 'pres de la plage', 'a quelques pas de la plage', 'plage') || hasPiedDansEau;
  const derivedDistance = hasPiedDansEau ? 0 : (hasProchePlage ? 150 : null);

  return {
    exterieurJardin: Array.from(new Set(exteriorValues)),
    confortEquipementsInterieurs: Array.from(new Set(interiorValues)),
    climatisation: hasToken('climatise', 'climatisation'),
    terrasse: hasToken('terrasse'),
    vueMer: hasVueMer,
    prochePlage: hasProchePlage,
    distancePlageM: derivedDistance,
    rdc: hasToken('rdc', 'rez de chaussee', 'rez-de-chaussee', 'ground floor'),
  };
};
const stringifyFeatureChoices = (value?: string | null) => {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean).join(', ') : '';
  } catch {
    return '';
  }
};
const APPARTEMENT_VENTE_DETAIL_FEATURES = new Set(
  Object.values(APPARTEMENT_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
APPARTEMENT_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Parking'));
APPARTEMENT_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Vue sur mer'));
const LOCAL_COMMERCIAL_VENTE_BOOLEAN_FIELDS = [
  'toilette', 'reserve_local', 'vitrine', 'coin_angle', 'electricite_3_phases', 'gaz_ville', 'alarme',
  'eau_puits', 'eau_sonede', 'electricite_steg'
] as const;
const LOCAL_COMMERCIAL_VENTE_BOOLEAN_LABELS: Record<(typeof LOCAL_COMMERCIAL_VENTE_BOOLEAN_FIELDS)[number], string> = {
  toilette: 'Toilette',
  reserve_local: 'RÃ©serve',
  vitrine: 'Vitrine',
  coin_angle: "Coin d'angle",
  electricite_3_phases: 'Ã‰lectricitÃ© 3 phases',
  gaz_ville: 'Gaz de ville',
  alarme: 'Alarme',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Ã‰lectricitÃ© STEG',
};
const LOCAL_COMMERCIAL_VENTE_DETAIL_FEATURES = new Set(
  Object.values(LOCAL_COMMERCIAL_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
const TERRAIN_VENTE_BOOLEAN_FIELDS = ['terrain_constructible', 'terrain_angle', 'eau_puits', 'eau_sonede', 'electricite_steg'] as const;
const TERRAIN_VENTE_BOOLEAN_LABELS: Record<(typeof TERRAIN_VENTE_BOOLEAN_FIELDS)[number], string> = {
  terrain_constructible: 'Constructible',
  terrain_angle: "Terrain d'angle",
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Ã‰lectricitÃ© STEG',
};
const TERRAIN_VENTE_DETAIL_FEATURES = new Set(
  Object.values(TERRAIN_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain agricole'));
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain habitation'));
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain industrielle'));
TERRAIN_VENTE_DETAIL_FEATURES.add(normalizeFeatureName('Terrain loisir'));
const IMMEUBLE_VENTE_BOOLEAN_FIELDS = ['immeuble_proche_plage', 'immeuble_ascenseur', 'immeuble_parking_sous_sol', 'immeuble_parking_exterieur', 'immeuble_syndic', 'immeuble_vue_mer', 'eau_puits', 'eau_sonede', 'electricite_steg'] as const;
const IMMEUBLE_VENTE_BOOLEAN_LABELS: Record<(typeof IMMEUBLE_VENTE_BOOLEAN_FIELDS)[number], string> = {
  immeuble_proche_plage: 'Proche de la plage',
  immeuble_ascenseur: 'Ascenseur',
  immeuble_parking_sous_sol: 'Parking sous-sol',
  immeuble_parking_exterieur: 'Parking extÃ©rieur',
  immeuble_syndic: 'Syndic',
  immeuble_vue_mer: 'Vue mer',
  eau_puits: 'Eau puits',
  eau_sonede: 'Eau Sonede',
  electricite_steg: 'Ã‰lectricitÃ© STEG',
};
const IMMEUBLE_VENTE_DETAIL_FEATURES = new Set(
  Object.values(IMMEUBLE_VENTE_BOOLEAN_LABELS).map((label) => normalizeFeatureName(label))
);
const isManagedDetailFeatureForContext = (
  normalizedFeatureName: string,
  mode: BienMode,
  type: BienType
) => {
  if (mode !== 'vente') return false;
  if (type === 'appartement') return APPARTEMENT_VENTE_DETAIL_FEATURES.has(normalizedFeatureName);
  if (type === 'local_commercial') return LOCAL_COMMERCIAL_VENTE_DETAIL_FEATURES.has(normalizedFeatureName);
  if (type === 'terrain') return TERRAIN_VENTE_DETAIL_FEATURES.has(normalizedFeatureName);
  if (type === 'immeuble') return IMMEUBLE_VENTE_DETAIL_FEATURES.has(normalizedFeatureName);
  return false;
};
const CHARACTERISTICS_MARKER = '[CARACTERISTIQUES_JSON]';
const buildDescriptionWithCharacteristics = (description: string, characteristics: string[]) => {
  const cleanDescription = String(description || '').trim();
  const normalizedCharacteristics = Array.from(
    new Set((Array.isArray(characteristics) ? characteristics : []).map((item) => String(item || '').trim()).filter(Boolean))
  );
  if (normalizedCharacteristics.length === 0) return cleanDescription;
  return `${cleanDescription}\n\n${CHARACTERISTICS_MARKER}\n${JSON.stringify(normalizedCharacteristics)}`.trim();
};
const DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT = 3;
const DEFAULT_COMMISSION_CLIENT_PERCENT = 2;
const DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE = 30;
const PROOF_MOTIF_TYPE_RUE = 'preuve_type_rue';
const PROOF_MOTIF_TYPE_PAPIER = 'preuve_type_papier';
const GALLERY_UNIT_MOTIF = 'gallery_unite';
const buildProofMotif = (
  proofType: typeof PROOF_MOTIF_TYPE_RUE | typeof PROOF_MOTIF_TYPE_PAPIER,
  mode?: BienMode,
  type?: BienType,
  unitKey?: string
) => `${proofType}|${mode || 'unknown_mode'}|${type || 'unknown_type'}${unitKey ? `|${unitKey}` : ''}`;
const buildUnitGalleryMotif = (mode?: BienMode, type?: BienType, unitKey?: string) =>
  `${GALLERY_UNIT_MOTIF}|${mode || 'unknown_mode'}|${type || 'unknown_type'}${unitKey ? `|${unitKey}` : ''}`;
const isProofMotif = (motif?: string | null) =>
  String(motif || '') === PROOF_MOTIF_TYPE_RUE
  || String(motif || '') === PROOF_MOTIF_TYPE_PAPIER
  || String(motif || '').startsWith(`${PROOF_MOTIF_TYPE_RUE}|`)
  || String(motif || '').startsWith(`${PROOF_MOTIF_TYPE_PAPIER}|`);

function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeVenteTarification(formData: Partial<Bien>) {
  const selectedType = (formData.type || 'appartement') as BienType;
  const terrainPrixDerive = selectedType === 'terrain'
    ? (Number(formData.terrain_prix_affiche_total || 0) || (Number(formData.terrain_surface_m2 || 0) * Number(formData.terrain_prix_affiche_par_m2 || 0)))
    : 0;
  const lotissementPrixDerive = selectedType === 'lotissement'
    ? Number(formData.lotissement_prix_total || 0)
    : 0;
  const prixAfficheClient = Number(formData.prix_affiche_client ?? formData.prix_nuitee ?? terrainPrixDerive ?? lotissementPrixDerive ?? 0);
  const tarificationMethode = (formData.tarification_methode || 'avec_commission') as TarificationMethodeVente;
  if (!Number.isFinite(prixAfficheClient) || prixAfficheClient <= 0) {
    return {
      prixAfficheClient: 0,
      prixFixeProprietaire: 0,
      prixFinal: 0,
      revenuAgence: 0,
      prixMinimumAccepte: 0,
      commissionPourcentageProprietaire: Number(formData.commission_pourcentage_proprietaire ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT),
      commissionPourcentageClient: Number(formData.commission_pourcentage_client ?? DEFAULT_COMMISSION_CLIENT_PERCENT),
    };
  }

  if (tarificationMethode === 'avec_commission') {
    const commissionPourcentageProprietaire = Number(formData.commission_pourcentage_proprietaire ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT);
    const commissionPourcentageClient = Number(formData.commission_pourcentage_client ?? DEFAULT_COMMISSION_CLIENT_PERCENT);
    const partProprietaire = toMoney((prixAfficheClient * Math.max(0, commissionPourcentageProprietaire)) / 100);
    const partClient = toMoney((prixAfficheClient * Math.max(0, commissionPourcentageClient)) / 100);
    const prixFixeProprietaire = toMoney(prixAfficheClient - partProprietaire);
    const prixFinal = toMoney(prixAfficheClient + partClient);
    const revenuAgence = toMoney(partProprietaire + partClient);

    return {
      prixAfficheClient: toMoney(prixAfficheClient),
      prixFixeProprietaire,
      prixFinal,
      revenuAgence,
      prixMinimumAccepte: 0,
      commissionPourcentageProprietaire: Math.max(0, commissionPourcentageProprietaire),
      commissionPourcentageClient: Math.max(0, commissionPourcentageClient),
    };
  }

  const prixFixeProprietaire = Math.max(0, Number(formData.prix_fixe_proprietaire ?? 0));
  const revenuAgence = toMoney(Math.max(0, prixAfficheClient - prixFixeProprietaire));
  const montantMaxReduction = Math.max(0, Number(formData.montant_max_reduction_negociation ?? 0));
  const reductionEffective = Math.min(montantMaxReduction, revenuAgence);
  const prixMinimumAccepte = toMoney(prixAfficheClient - reductionEffective);

  return {
    prixAfficheClient: toMoney(prixAfficheClient),
    prixFixeProprietaire: toMoney(prixFixeProprietaire),
    prixFinal: toMoney(prixAfficheClient),
    revenuAgence,
    prixMinimumAccepte,
    commissionPourcentageProprietaire: 0,
    commissionPourcentageClient: 0,
  };
}

function computeVentePaiement(formData: Partial<Bien>, prixTotalClient: number) {
  const total = Number(prixTotalClient || 0);
  const modalite = (formData.modalite_paiement_vente || 'comptant') as ModalitePaiementVente;
  if (!Number.isFinite(total) || total <= 0) {
    return {
      modalite,
      pourcentagePremierePartiePromesse: 0,
      montantPremierePartiePromesse: 0,
      montantDeuxiemePartie: 0,
      nombreTranches: Number(formData.nombre_tranches ?? 0),
      periodeTranchesMois: Number(formData.periode_tranches_mois ?? 0),
      montantParTranche: 0,
    };
  }

  if (modalite === 'comptant') {
    return {
      modalite,
      pourcentagePremierePartiePromesse: 100,
      montantPremierePartiePromesse: toMoney(total),
      montantDeuxiemePartie: 0,
      nombreTranches: 0,
      periodeTranchesMois: 0,
      montantParTranche: 0,
    };
  }

  const pourcentagePremierePartiePromesse = Math.max(0, Number(formData.pourcentage_premiere_partie_promesse ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE));
  const montantPremierePartiePromesse = toMoney((total * pourcentagePremierePartiePromesse) / 100);
  const montantDeuxiemePartie = toMoney(Math.max(0, total - montantPremierePartiePromesse));
  const nombreTranches = Math.max(0, Math.floor(Number(formData.nombre_tranches ?? 0)));
  const periodeTranchesMois = Math.max(0, Math.floor(Number(formData.periode_tranches_mois ?? 0)));
  const montantParTranche = nombreTranches > 0 ? toMoney(montantDeuxiemePartie / nombreTranches) : 0;

  return {
    modalite,
    pourcentagePremierePartiePromesse,
    montantPremierePartiePromesse,
    montantDeuxiemePartie,
    nombreTranches,
    periodeTranchesMois,
    montantParTranche,
  };
}

export default function BiensPage() {
  const { biens, zones, proprietaires, modePriorities, saveModePriorities, addBien, updateBien, deleteBien, refreshData, isLoading } = useProperties();
  const zoneOptions = zones.length > 0 ? zones : mockZones;
  const [fallbackProprietaires, setFallbackProprietaires] = useState<Proprietaire[]>([]);
  const proprietaireOptions = (Array.isArray(proprietaires) && proprietaires.length > 0)
    ? proprietaires
    : fallbackProprietaires;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BienStatut | 'all'>('all');
  const [modeFilter, setModeFilter] = useState<BienMode | 'all'>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingBien, setEditingBien] = useState<Bien | null>(null);
  const [duplicateSeedBien, setDuplicateSeedBien] = useState<Bien | null>(null);
  const [viewingBien, setViewingBien] = useState<Bien | null>(null);
  const [editorInitialStep, setEditorInitialStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [saveStatusByBienId, setSaveStatusByBienId] = useState<Record<string, { state: 'saving' | 'saved' | 'error'; at: number }>>({});
  const [priorityDraft, setPriorityDraft] = useState<Record<BienMode, number>>(modePriorities);
  const [isSavingPriorities, setIsSavingPriorities] = useState(false);
  const [typeImageMode, setTypeImageMode] = useState<BienMode>('location_saisonniere');
  const [typeImageScope, setTypeImageScope] = useState<'main' | 'sub'>('main');
  const [typeImageMainType, setTypeImageMainType] = useState<'appartement' | 'villa_maison' | 'studio' | 'immeuble' | 'autre'>('appartement');
  const [typeImageSubType, setTypeImageSubType] = useState<string>('S+1');
  const [typeImageFile, setTypeImageFile] = useState<File | null>(null);
  const [typeImagePreview, setTypeImagePreview] = useState<string>('');
  const [typeImageRows, setTypeImageRows] = useState<Array<{ id: string; mode_bien: string; main_type: string; sub_type: string | null; image_url: string }>>([]);
  const [isSavingTypeImage, setIsSavingTypeImage] = useState(false);
  const [homeFilterImageMode, setHomeFilterImageMode] = useState<BienMode>('location_saisonniere');
  const [homeFilterImageGroup, setHomeFilterImageGroup] = useState<'seaside' | 'comfort'>('seaside');
  const [homeFilterImageOption, setHomeFilterImageOption] = useState<string>('pied_dans_eau');
  const [homeFilterImageFile, setHomeFilterImageFile] = useState<File | null>(null);
  const [homeFilterImagePreview, setHomeFilterImagePreview] = useState<string>('');
  const [homeFilterImageRows, setHomeFilterImageRows] = useState<Array<{ id: string; mode_bien: string; filter_group: string; option_key: string; image_url: string }>>([]);
  const [isSavingHomeFilterImage, setIsSavingHomeFilterImage] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (Array.isArray(proprietaires) && proprietaires.length > 0) {
      setFallbackProprietaires([]);
      return () => {
        isMounted = false;
      };
    }
    const loadFallbackProprietaires = async () => {
      try {
        const response = await fetch(`${API_URL}/proprietaires`, { credentials: 'include' });
        if (!response.ok) return;
        const rows = await response.json();
        if (!isMounted) return;
        setFallbackProprietaires(Array.isArray(rows) ? rows : []);
      } catch {
        if (!isMounted) return;
        setFallbackProprietaires([]);
      }
    };
    void loadFallbackProprietaires();
    return () => {
      isMounted = false;
    };
  }, [proprietaires]);

  useEffect(() => {
    setPriorityDraft(modePriorities);
  }, [modePriorities]);

  const priorityValues = Object.values(priorityDraft);
  const hasValidPrioritySet =
    priorityValues.length === 3 &&
    priorityValues.every((value) => Number.isInteger(value) && value >= 1 && value <= 3) &&
    new Set(priorityValues).size === 3;

  const filteredBiens = biens.filter((bien) => {
    const query = searchTerm.toLowerCase();
    const matchesQuery = bien.titre.toLowerCase().includes(query) || bien.reference.toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || bien.statut === statusFilter;
    const matchesMode = modeFilter === 'all' || bien.mode === modeFilter;
    return matchesQuery && matchesStatus && matchesMode;
  });
  const modeTabs: Array<{ value: BienMode | 'all'; label: string }> = [
    { value: 'all', label: 'Tous les biens' },
    { value: 'vente', label: 'Vente' },
    { value: 'location_annuelle', label: 'Location annuelle' },
    { value: 'location_saisonniere', label: 'Location saisonniere' },
  ];
  const mainTypeOptions = [
    { value: 'appartement', label: 'Appartement' },
    { value: 'villa_maison', label: 'Villa / Maison' },
    { value: 'studio', label: 'Studio' },
    { value: 'immeuble', label: 'Immeuble' },
    { value: 'autre', label: 'Autre' },
  ] as const;
  const subTypeByMain: Record<string, string[]> = {
    appartement: ['S+1', 'S+2', 'S+3', 'S+4'],
    villa_maison: ['Villa'],
    studio: ['Studio'],
    immeuble: ['Immeuble'],
    autre: ['Autre'],
  };
  const currentSubTypeOptions = subTypeByMain[typeImageMainType] || ['Autre'];
  const homeFilterOptionLabels: Record<string, string> = {
    pied_dans_eau: "Pied dans l'eau",
    vue_sur_mer: 'Vue sur mer',
    pres_plage: 'Pres de la plage',
    climatise: 'Climatise',
    toutes_pieces_climatisees: 'Toutes les pieces climatisees',
    rdc: 'RDC',
    jardin_gazon: 'Jardin / Gazon',
    terrasse: 'Terrasse',
    piscine_privee: 'Piscine privee',
    piscine_partagee: 'Piscine partagee',
  };
  const homeFilterOptionsByGroup: Record<'seaside' | 'comfort', string[]> = {
    seaside: ['pied_dans_eau', 'vue_sur_mer', 'pres_plage'],
    comfort: ['climatise', 'toutes_pieces_climatisees', 'rdc', 'jardin_gazon', 'terrasse', 'piscine_privee', 'piscine_partagee'],
  };
  const currentHomeFilterOptions = homeFilterOptionsByGroup[homeFilterImageGroup];

  useEffect(() => {
    if (!currentSubTypeOptions.includes(typeImageSubType)) {
      setTypeImageSubType(currentSubTypeOptions[0] || 'Autre');
    }
  }, [typeImageMainType]);
  useEffect(() => {
    if (!currentHomeFilterOptions.includes(homeFilterImageOption)) {
      setHomeFilterImageOption(currentHomeFilterOptions[0] || 'pied_dans_eau');
    }
  }, [homeFilterImageGroup]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/type-filter-images?mode=${encodeURIComponent(typeImageMode)}`);
        if (!response.ok) throw new Error('type-filter-images');
        const rows = await response.json();
        if (!cancelled) setTypeImageRows(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setTypeImageRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typeImageMode]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/home-filter-option-images?mode=${encodeURIComponent(homeFilterImageMode)}`);
        if (!response.ok) throw new Error('home-filter-option-images');
        const rows = await response.json();
        if (!cancelled) setHomeFilterImageRows(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setHomeFilterImageRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homeFilterImageMode]);

  const handleTypeImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setTypeImageFile(file);
    if (!file) {
      setTypeImagePreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setTypeImagePreview(url);
  };
  const handleHomeFilterImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setHomeFilterImageFile(file);
    if (!file) {
      setHomeFilterImagePreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setHomeFilterImagePreview(url);
  };

  const handleSaveTypeFilterImage = async () => {
    if (!typeImageFile) {
      toast.error("Choisissez une image");
      return;
    }
    setIsSavingTypeImage(true);
    try {
      const uploadPayload = new FormData();
      uploadPayload.append('image', typeImageFile);
      uploadPayload.append('upload_scope', 'type_filter');
      uploadPayload.append('mode_bien', typeImageMode);
      uploadPayload.append('main_type', typeImageMainType);
      uploadPayload.append('sub_type', typeImageScope === 'sub' ? typeImageSubType : '');
      const uploadResponse = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: uploadPayload,
      });
      if (!uploadResponse.ok) throw new Error('upload');
      const uploadResult = await uploadResponse.json();
      const imageUrl = String(uploadResult?.url || '').trim();
      if (!imageUrl) throw new Error('image-url');

      const saveResponse = await fetch(`${API_URL}/type-filter-images`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode_bien: typeImageMode,
          main_type: typeImageMainType,
          sub_type: typeImageScope === 'sub' ? typeImageSubType : null,
          image_url: imageUrl,
        }),
      });
      if (!saveResponse.ok) throw new Error('save');

      const refreshResponse = await fetch(`${API_URL}/type-filter-images?mode=${encodeURIComponent(typeImageMode)}`);
      if (refreshResponse.ok) {
        const rows = await refreshResponse.json();
        setTypeImageRows(Array.isArray(rows) ? rows : []);
      }
      toast.success("Image type enregistree");
      setTypeImageFile(null);
      setTypeImagePreview('');
    } catch {
      toast.error("Erreur enregistrement image type");
    } finally {
      setIsSavingTypeImage(false);
    }
  };
  const handleDeleteTypeFilterImage = async (id: string) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;
    if (!window.confirm("Supprimer cette image de type ?")) return;
    setIsSavingTypeImage(true);
    try {
      const response = await fetch(`${API_URL}/type-filter-images/${encodeURIComponent(normalizedId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('delete-type-image');
      const refreshResponse = await fetch(`${API_URL}/type-filter-images?mode=${encodeURIComponent(typeImageMode)}`);
      if (refreshResponse.ok) {
        const rows = await refreshResponse.json();
        setTypeImageRows(Array.isArray(rows) ? rows : []);
      } else {
        setTypeImageRows((prev) => prev.filter((row) => row.id !== normalizedId));
      }
      toast.success('Image type supprimee');
    } catch {
      toast.error("Erreur suppression image type");
    } finally {
      setIsSavingTypeImage(false);
    }
  };
  const handleSaveHomeFilterOptionImage = async () => {
    if (!homeFilterImageFile) {
      toast.error("Choisissez une image");
      return;
    }
    setIsSavingHomeFilterImage(true);
    try {
      const uploadPayload = new FormData();
      uploadPayload.append('image', homeFilterImageFile);
      uploadPayload.append('upload_scope', 'home_filter_option');
      uploadPayload.append('mode_bien', homeFilterImageMode);
      uploadPayload.append('filter_group', homeFilterImageGroup);
      uploadPayload.append('option_key', homeFilterImageOption);
      const uploadResponse = await fetch(`${API_URL}/upload`, { method: 'POST', body: uploadPayload });
      if (!uploadResponse.ok) throw new Error('upload-home-filter-image');
      const uploadResult = await uploadResponse.json();
      const imageUrl = String(uploadResult?.url || '').trim();
      if (!imageUrl) throw new Error('home-filter-image-url');

      const saveResponse = await fetch(`${API_URL}/home-filter-option-images`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode_bien: homeFilterImageMode,
          filter_group: homeFilterImageGroup,
          option_key: homeFilterImageOption,
          image_url: imageUrl,
        }),
      });
      if (!saveResponse.ok) {
        let serverMessage = `HTTP ${saveResponse.status}`;
        try {
          const payload = await saveResponse.json();
          serverMessage = String(payload?.error || payload?.message || serverMessage);
        } catch {}
        if (saveResponse.status === 404) {
          throw new Error("Endpoint /api/home-filter-option-images introuvable (redemarrer le backend)");
        }
        throw new Error(serverMessage);
      }
      const refreshResponse = await fetch(`${API_URL}/home-filter-option-images?mode=${encodeURIComponent(homeFilterImageMode)}`);
      if (refreshResponse.ok) {
        const rows = await refreshResponse.json();
        setHomeFilterImageRows(Array.isArray(rows) ? rows : []);
      }
      setHomeFilterImageFile(null);
      setHomeFilterImagePreview('');
      toast.success('Image filtre accueil enregistree');
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur enregistrement image filtre accueil";
      toast.error(message);
    } finally {
      setIsSavingHomeFilterImage(false);
    }
  };
  const handleDeleteHomeFilterOptionImage = async (id: string) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;
    if (!window.confirm("Supprimer cette image de filtre accueil ?")) return;
    setIsSavingHomeFilterImage(true);
    try {
      const response = await fetch(`${API_URL}/home-filter-option-images/${encodeURIComponent(normalizedId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('delete-home-filter-image');
      const refreshResponse = await fetch(`${API_URL}/home-filter-option-images?mode=${encodeURIComponent(homeFilterImageMode)}`);
      if (refreshResponse.ok) {
        const rows = await refreshResponse.json();
        setHomeFilterImageRows(Array.isArray(rows) ? rows : []);
      } else {
        setHomeFilterImageRows((prev) => prev.filter((row) => row.id !== normalizedId));
      }
      toast.success('Image filtre accueil supprimee');
    } catch {
      toast.error("Erreur suppression image filtre accueil");
    } finally {
      setIsSavingHomeFilterImage(false);
    }
  };

  const handleDelete = async (id: string) => { if (window.confirm('Supprimer ce bien ?')) { try { await deleteBien(id); toast.success('Bien supprimÃ©'); } catch { toast.error('Erreur'); } } };
  const buildDuplicateSeed = (source: Bien): Bien => {
    const clone = JSON.parse(JSON.stringify(source)) as Bien;
    const nowIso = new Date().toISOString();
    const today = nowIso.split('T')[0];
    const next: any = {
      ...clone,
      id: '',
      reference: '',
      titre: `${String(source.titre || '').trim() || 'Bien'} (Copie)`,
      created_at: nowIso,
      updated_at: nowIso,
      date_ajout: today,
    };
    delete next.deleted_media_ids;
    delete next.admin_last_saved_at;
    return next as Bien;
  };
  const handleDuplicate = (bien: Bien) => {
    setEditingBien(null);
    setDuplicateSeedBien(buildDuplicateSeed(bien));
    setEditorInitialStep(1);
    setIsAddOpen(true);
  };
  const buildMediaSyncKey = (item: { type?: string; url?: string; motif_upload?: string | null; position?: number | null }) =>
    `${String(item.type || 'image')}|${String(item.url || '').trim()}|${String(item.motif_upload || '').trim()}|${Number(item.position ?? 0)}`;
  const normalizeMediaForComparison = (media: Array<{ type?: string; url?: string; motif_upload?: string | null }> = []) =>
    media.map((item, idx) => ({
      type: String(item.type || 'image').trim() || 'image',
      url: String(item.url || '').trim(),
      motif_upload: String(item.motif_upload || '').trim(),
      position: idx,
    }));
  const hasMediaChanged = (
    previousMedia: Array<{ type?: string; url?: string; motif_upload?: string | null }> = [],
    nextMedia: Array<{ type?: string; url?: string; motif_upload?: string | null }> = []
  ) => {
    const previous = normalizeMediaForComparison(previousMedia);
    const next = normalizeMediaForComparison(nextMedia);
    if (previous.length !== next.length) return true;
    for (let i = 0; i < previous.length; i += 1) {
      if (
        previous[i].type !== next[i].type
        || previous[i].url !== next[i].url
        || previous[i].motif_upload !== next[i].motif_upload
        || previous[i].position !== next[i].position
      ) {
        return true;
      }
    }
    return false;
  };

  const syncMediaForBien = async (bienId: string, media: Media[]) => {
    const existingResponse = await fetch(`${API_URL}/media/${bienId}`);
    const existingMedia = existingResponse.ok ? await existingResponse.json() : [];
    const orderedMedia = (Array.isArray(media) ? media : []).map((m, idx) => ({ ...m, position: idx }));

    const existingBuckets = new Map<string, any[]>();
    for (const item of Array.isArray(existingMedia) ? existingMedia : []) {
      const key = buildMediaSyncKey(item);
      const list = existingBuckets.get(key) || [];
      list.push(item);
      existingBuckets.set(key, list);
    }

    const toCreate: Array<{ type?: string; url?: string; motif_upload?: string | null; position?: number | null }> = [];
    for (const item of orderedMedia) {
      const key = buildMediaSyncKey(item);
      const existingList = existingBuckets.get(key);
      if (existingList && existingList.length > 0) {
        existingList.pop();
        continue;
      }
      toCreate.push(item);
    }

    const toDelete: any[] = [];
    for (const list of existingBuckets.values()) {
      if (list.length > 0) {
        toDelete.push(...list);
      }
    }

    if (toDelete.length === 0 && toCreate.length === 0) {
      return;
    }

    for (const m of toDelete) {
      await fetch(`${API_URL}/media/${m.id}`, { method: 'DELETE' });
    }

    for (const m of toCreate) {
      const createResponse = await fetch(`${API_URL}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bien_id: bienId, type: m.type || 'image', url: m.url, motif_upload: m.motif_upload || null, position: m.position ?? 0 }),
      });
      if (!createResponse.ok) throw new Error('Failed to save media');
    }
  };
  const deleteMediaIdsForBien = async (mediaIds: string[]) => {
    const uniqueIds = Array.from(new Set((Array.isArray(mediaIds) ? mediaIds : []).map((id) => String(id || '').trim()).filter(Boolean)));
    for (const mediaId of uniqueIds) {
      const deleteResponse = await fetch(`${API_URL}/media/${encodeURIComponent(mediaId)}`, { method: 'DELETE' });
      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        throw new Error(`Failed to delete media ${mediaId}`);
      }
    }
  };
  const syncUnavailableDatesForBien = async (bienId: string, dates: DateStatus[]) => {
    const normalizedBienId = String(bienId || '').trim();
    if (!normalizedBienId) return;

    const normalizeStatus = (value: unknown): 'blocked' | 'pending' | 'booked' => {
      const raw = String(value || '').trim().toLowerCase();
      if (raw === 'booked' || raw === 'pending' || raw === 'blocked') return raw;
      return 'blocked';
    };
    const normalizeSqlDate = (value: unknown): string => String(value || '').slice(0, 10);
    const isValidSqlDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);
    const buildKey = (start: string, end: string, status: string) => `${start}|${end}|${status}`;

    const desired = (Array.isArray(dates) ? dates : [])
      .map((item) => {
        const start = normalizeSqlDate(item?.start);
        const end = normalizeSqlDate(item?.end);
        const status = normalizeStatus(item?.status);
        if (!start || !end || !isValidSqlDate(start) || !isValidSqlDate(end) || end < start) return null;
        return { start, end, status };
      })
      .filter((item): item is { start: string; end: string; status: 'blocked' | 'pending' | 'booked' } => Boolean(item));

    const existingResponse = await fetch(`${API_URL}/unavailable-dates/${encodeURIComponent(normalizedBienId)}`, { credentials: 'include' });
    if (!existingResponse.ok) {
      throw new Error('Failed to fetch unavailable dates');
    }
    const existingRows = (await existingResponse.json().catch(() => [])) as Array<{
      id?: string;
      start_date?: string;
      end_date?: string;
      status?: string;
      reservation_demand_id?: string | null;
    }>;

    // Sync exactly what the admin keeps in the calendar list:
    // if an entry is removed in UI, it must be deleted from DB too.
    const managedExisting = Array.isArray(existingRows) ? existingRows : [];
    const existingBuckets = new Map<string, Array<{ id: string }>>();
    for (const row of managedExisting) {
      const id = String(row?.id || '').trim();
      const start = normalizeSqlDate(row?.start_date);
      const end = normalizeSqlDate(row?.end_date);
      const status = normalizeStatus(row?.status);
      if (!id || !start || !end || !isValidSqlDate(start) || !isValidSqlDate(end)) continue;
      const key = buildKey(start, end, status);
      const list = existingBuckets.get(key) || [];
      list.push({ id });
      existingBuckets.set(key, list);
    }

    const toCreate: Array<{ start: string; end: string; status: 'blocked' | 'pending' | 'booked' }> = [];
    for (const row of desired) {
      const key = buildKey(row.start, row.end, row.status);
      const existingList = existingBuckets.get(key);
      if (existingList && existingList.length > 0) {
        existingList.pop();
      } else {
        toCreate.push(row);
      }
    }

    const toDelete: string[] = [];
    for (const list of existingBuckets.values()) {
      for (const item of list) toDelete.push(item.id);
    }

    for (const unavailableDateId of toDelete) {
      const deleteResponse = await fetch(`${API_URL}/unavailable-dates/${encodeURIComponent(unavailableDateId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        throw new Error('Failed to delete unavailable date');
      }
    }

    for (const row of toCreate) {
      const createResponse = await fetch(`${API_URL}/unavailable-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bien_id: normalizedBienId,
          start_date: row.start,
          end_date: row.end,
          status: row.status,
        }),
      });
      if (!createResponse.ok) {
        throw new Error('Failed to save unavailable date');
      }
    }
  };
  const handleSave = async (bien: Bien) => {
    const isEditingNow = Boolean(editingBien);
    const editingSnapshot = editingBien;
    const deletedMediaIds = Array.isArray((bien as any)?.deleted_media_ids)
      ? (bien as any).deleted_media_ids.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : [];
    const targetBienId = String(bien?.id || '').trim();
    if (targetBienId) {
      setSaveStatusByBienId((prev) => ({ ...prev, [targetBienId]: { state: 'saving', at: Date.now() } }));
    }
    setIsAddOpen(false);
    setEditingBien(null);

    void (async () => {
      try {
        const { created_at, updated_at, media, unavailableDates, ...bienData } = bien;
        let finalBienId = targetBienId;
        const mediaWasChanged = isEditingNow
          ? hasMediaChanged(editingSnapshot?.media || [], media || [])
          : true;
        if (isEditingNow) {
          await updateBien(bien as any);
          if (deletedMediaIds.length > 0) {
            await deleteMediaIdsForBien(deletedMediaIds);
          }
          if (mediaWasChanged) {
            await syncMediaForBien(bien.id, media || []);
          }
          await syncUnavailableDatesForBien(bien.id, unavailableDates || []);
        } else {
          const createdBienId = await addBien(bienData as any);
          finalBienId = String(createdBienId || String(bienData.id || bien.id || ''));
          await syncMediaForBien(finalBienId, media || []);
          await syncUnavailableDatesForBien(finalBienId, unavailableDates || []);
        }
        await refreshData();
        if (finalBienId) {
          setSaveStatusByBienId((prev) => ({ ...prev, [finalBienId]: { state: 'saved', at: Date.now() } }));
        }
      } catch (error: any) {
        const message = String(error?.message || '').trim();
        if (message.includes('mandat proprietaire manquant, invalide ou expire') && bien.visible_sur_site !== false) {
          try {
            const draftBien = { ...bien, visible_sur_site: false } as any;
            let finalBienId = targetBienId;
            const fallbackMediaWasChanged = isEditingNow
              ? hasMediaChanged(editingSnapshot?.media || [], bien.media || [])
              : true;
            if (isEditingNow) {
              await updateBien(draftBien);
              if (deletedMediaIds.length > 0) {
                await deleteMediaIdsForBien(deletedMediaIds);
              }
              if (fallbackMediaWasChanged) {
                await syncMediaForBien(bien.id, bien.media || []);
              }
              await syncUnavailableDatesForBien(bien.id, bien.unavailableDates || []);
            } else {
              const { created_at: _createdAt, updated_at: _updatedAt, media: _media, unavailableDates: _dates, ...draftBienData } = draftBien;
              const createdBienId = await addBien(draftBienData);
              finalBienId = String(createdBienId || String(draftBienData.id || bien.id || ''));
              await syncMediaForBien(finalBienId, bien.media || []);
              await syncUnavailableDatesForBien(finalBienId, bien.unavailableDates || []);
            }
            await refreshData();
            if (finalBienId) {
              setSaveStatusByBienId((prev) => ({ ...prev, [finalBienId]: { state: 'saved', at: Date.now() } }));
            }
            return;
          } catch (retryError: any) {
            const retryMessage = String(retryError?.message || '').trim();
            if (targetBienId) {
              setSaveStatusByBienId((prev) => ({ ...prev, [targetBienId]: { state: 'error', at: Date.now() } }));
            }
            toast.error(retryMessage ? `Erreur sauvegarde: ${retryMessage}` : 'Erreur sauvegarde');
            return;
          }
        }
        if (targetBienId) {
          setSaveStatusByBienId((prev) => ({ ...prev, [targetBienId]: { state: 'error', at: Date.now() } }));
        }
        toast.error(message ? `Erreur sauvegarde: ${message}` : 'Erreur sauvegarde');
      }
    })();
  };
  const handlePreviewVisibilitySave = async (bienId: string, patch: { visible_sur_site: boolean; ui_config: BienUiConfig | null }) => {
    const currentBien = biens.find((item) => item.id === bienId) || viewingBien;
    if (!currentBien) return;
    try {
      const savedBien = await updateBien({ ...currentBien, ...patch } as any);
      await refreshData();
      const savedVisible = savedBien?.visible_sur_site === 1 || savedBien?.visible_sur_site === true || savedBien?.visible_sur_site === '1';
      const resolvedPatch = {
        visible_sur_site: savedVisible,
        ui_config: savedBien?.ui_config_json && typeof savedBien.ui_config_json === 'string'
          ? JSON.parse(savedBien.ui_config_json)
          : (savedBien?.ui_config || patch.ui_config || null),
      };
      setViewingBien((prev) => prev && prev.id === bienId ? { ...prev, ...resolvedPatch } : prev);
      setEditingBien((prev) => prev && prev.id === bienId ? { ...prev, ...resolvedPatch } : prev);
      if (patch.visible_sur_site !== resolvedPatch.visible_sur_site) {
        toast.info('Le bien a ete sauvegarde hors site. Le mandat proprietaire ne permet pas la publication.');
      } else {
        toast.success('Visibilite mise a jour');
      }
    } catch (error: any) {
      const message = String(error?.message || '').trim();
      toast.error(message ? `Erreur visibilite: ${message}` : 'Erreur visibilite');
    }
  };
  const handleSaveModePriorities = async () => {
    if (!hasValidPrioritySet) {
      toast.error('Choisissez exactement 1, 2 et 3, sans doublon.');
      return;
    }
    try {
      setIsSavingPriorities(true);
      await saveModePriorities(priorityDraft);
      toast.success('Priorites des modes mises a jour');
    } catch (error: any) {
      const message = String(error?.message || '').trim();
      toast.error(message ? `Erreur priorites: ${message}` : 'Erreur priorites');
    } finally {
      setIsSavingPriorities(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div><h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gestion des Biens</h1><p className="text-xs sm:text-sm text-gray-500">GÃ©rez votre portefeuille</p></div>
        <button onClick={() => { setEditingBien(null); setEditorInitialStep(1); setIsAddOpen(true); }} className="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" /> Nouveau Bien</button>
      </div>
      <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-5 w-5 text-gray-400" /></div><input type="text" className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
        <div className="w-full sm:w-64"><select className="block w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as BienStatut | 'all')}><option value="all">Tous les statuts</option><option value="disponible">Disponible</option><option value="loue">LouÃ©</option><option value="reserve">RÃ©servÃ©</option><option value="maintenance">Maintenance</option><option value="bloque">BloquÃ©</option></select></div>
      </div>
      <div className="bg-white p-2 sm:p-3 rounded-lg shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-2">
          {modeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setModeFilter(tab.value)}
              className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                modeFilter === tab.value
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-gray-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Priorite des modes sur l'accueil</h2>
            <p className="text-sm text-gray-500">Le mode avec priorite 1 sera affiche en premier sur `https://dwiraimmobilier.com`.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[540px]">
            {([
              { key: 'location_saisonniere', label: 'Location saisonniere' },
              { key: 'vente', label: 'Vente' },
              { key: 'location_annuelle', label: 'Location annuelle' },
            ] as Array<{ key: BienMode; label: string }>).map((item) => (
              <label key={item.key} className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">{item.label}</span>
                <select
                  value={priorityDraft[item.key]}
                  onChange={(event) => setPriorityDraft((prev) => ({ ...prev, [item.key]: Number(event.target.value) }))}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value={1}>Priorite 1</option>
                  <option value={2}>Priorite 2</option>
                  <option value={3}>Priorite 3</option>
                </select>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSaveModePriorities()}
            disabled={isSavingPriorities || !hasValidPrioritySet}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSavingPriorities ? 'Enregistrement...' : 'Enregistrer les priorites'}
          </button>
        </div>
        {!hasValidPrioritySet && (
          <p className="mt-3 text-sm text-amber-700">
            Les trois modes doivent avoir les priorites 1, 2 et 3, sans doublon.
          </p>
        )}
      </div>
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-gray-100 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Images filtres types (Accueil)</h2>
          <p className="text-sm text-gray-500">Uploader ici les images des types principaux et sous-types pour le filtre Type de bien.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Mode</span>
            <select value={typeImageMode} onChange={(e) => setTypeImageMode(e.target.value as BienMode)} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="location_saisonniere">Location saisonniere</option>
              <option value="vente">Vente</option>
              <option value="location_annuelle">Location annuelle</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Niveau</span>
            <select value={typeImageScope} onChange={(e) => setTypeImageScope(e.target.value as 'main' | 'sub')} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="main">Type principal</option>
              <option value="sub">Sous-type</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Type principal</span>
            <select value={typeImageMainType} onChange={(e) => setTypeImageMainType(e.target.value as any)} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              {mainTypeOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Sous-type</span>
            <select value={typeImageSubType} onChange={(e) => setTypeImageSubType(e.target.value)} disabled={typeImageScope !== 'sub'} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400">
              {currentSubTypeOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <input type="file" accept="image/*,.heic,.heif" onChange={handleTypeImageFileChange} className="block w-full text-sm" />
          <button type="button" onClick={() => void handleSaveTypeFilterImage()} disabled={isSavingTypeImage || !typeImageFile} className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isSavingTypeImage ? 'Enregistrement...' : 'Enregistrer image type'}
          </button>
        </div>
        {typeImagePreview && (
          <div className="rounded-lg border border-gray-200 p-2">
            <img src={typeImagePreview} alt="Apercu type" className="h-28 w-full rounded-md object-cover md:w-72" />
          </div>
        )}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Images enregistrees (mode selectionne)</p>
          {typeImageRows.length === 0 && <p className="text-sm text-gray-500">Aucune image enregistree.</p>}
              {typeImageRows.length > 0 && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {typeImageRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-2">
                      <div className="flex items-center gap-3 min-w-0">
                      <img src={resolveMediaUrl(row.image_url)} alt={row.sub_type || row.main_type} className="h-14 w-20 rounded object-cover" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{row.main_type}</p>
                        <p className="text-xs text-gray-500">{row.sub_type ? `Sous-type: ${row.sub_type}` : 'Type principal'}</p>
                      </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTypeFilterImage(row.id)}
                        disabled={isSavingTypeImage}
                        className="inline-flex items-center justify-center rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
      </div>
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow-sm border border-gray-100 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Images filtres 4 et 5 (Accueil)</h2>
          <p className="text-sm text-gray-500">
            Uploader ici les images des options pour les filtres "Bord de mer" et "Confort".
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Mode</span>
            <select value={homeFilterImageMode} onChange={(e) => setHomeFilterImageMode(e.target.value as BienMode)} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="location_saisonniere">Location saisonniere</option>
              <option value="vente">Vente</option>
              <option value="location_annuelle">Location annuelle</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Filtre</span>
            <select value={homeFilterImageGroup} onChange={(e) => setHomeFilterImageGroup(e.target.value as 'seaside' | 'comfort')} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="seaside">4. Bord de mer</option>
              <option value="comfort">5. Confort</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Option</span>
            <select value={homeFilterImageOption} onChange={(e) => setHomeFilterImageOption(e.target.value)} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              {currentHomeFilterOptions.map((key) => (
                <option key={key} value={key}>{homeFilterOptionLabels[key] || key}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <input type="file" accept="image/*,.heic,.heif" onChange={handleHomeFilterImageFileChange} className="block w-full text-sm" />
          <button
            type="button"
            onClick={() => void handleSaveHomeFilterOptionImage()}
            disabled={isSavingHomeFilterImage || !homeFilterImageFile}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSavingHomeFilterImage ? 'Enregistrement...' : 'Enregistrer image filtre'}
          </button>
        </div>
        {homeFilterImagePreview && (
          <div className="rounded-lg border border-gray-200 p-2">
            <img src={homeFilterImagePreview} alt="Apercu filtre accueil" className="h-28 w-full rounded-md object-cover md:w-72" />
          </div>
        )}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Images enregistrees (mode selectionne)</p>
          {homeFilterImageRows.length === 0 && <p className="text-sm text-gray-500">Aucune image enregistree.</p>}
          {homeFilterImageRows.length > 0 && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {homeFilterImageRows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <img src={resolveMediaUrl(row.image_url)} alt={homeFilterOptionLabels[row.option_key] || row.option_key} className="h-14 w-20 rounded object-cover" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{homeFilterOptionLabels[row.option_key] || row.option_key}</p>
                      <p className="text-xs text-gray-500">{row.filter_group === 'seaside' ? 'Filtre 4: Bord de mer' : 'Filtre 5: Confort'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteHomeFilterOptionImage(row.id)}
                    disabled={isSavingHomeFilterImage}
                    className="inline-flex items-center justify-center rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {filteredBiens.map((bien) => <BienCard key={bien.id} bien={bien} zones={zoneOptions} saveStatus={saveStatusByBienId[bien.id]} onEdit={() => { setDuplicateSeedBien(null); setEditingBien(bien); setEditorInitialStep(1); setIsAddOpen(true); }} onDuplicate={() => handleDuplicate(bien)} onDelete={() => handleDelete(bien.id)} onView={() => setViewingBien(bien)} />)}
      </div>
      {filteredBiens.length === 0 && <div className="text-center py-12"><Home className="mx-auto h-10 w-10 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">Aucun bien trouvÃ©</h3></div>}
      <Dialog.Root open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) { setEditorInitialStep(1); setDuplicateSeedBien(null); } }}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" /><Dialog.Content className="fixed inset-0 z-50 w-full h-full bg-white overflow-hidden flex flex-col">
          <Dialog.Description className="sr-only">Formulaire d'ajout ou de modification de bien</Dialog.Description>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center gap-3"><button onClick={() => setIsAddOpen(false)} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><Dialog.Title className="text-lg font-semibold text-gray-900">{editingBien ? 'Modifier le bien' : duplicateSeedBien ? 'Dupliquer le bien' : 'Nouveau bien'}</Dialog.Title></div>
            <button
              onClick={() => {
                const form = document.getElementById('bien-editor-form') as HTMLFormElement | null;
                if (form) form.requestSubmit();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            ><Save className="h-4 w-4" /><span>Sauvegarder</span></button>
          </div>
          <div className="flex-1 overflow-y-auto"><BienEditor initialData={editingBien} seedData={duplicateSeedBien} initialGeneralStep={editorInitialStep} zones={zoneOptions} proprietaires={proprietaireOptions} existingBiens={biens} onSubmit={handleSave} onCancel={() => setIsAddOpen(false)} /></div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={!!viewingBien} onOpenChange={() => setViewingBien(null)}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" /><Dialog.Content className="fixed inset-0 z-50 w-full h-full bg-white overflow-hidden flex flex-col">
          <Dialog.Description className="sr-only">Apercu du bien</Dialog.Description>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center gap-3"><button onClick={() => setViewingBien(null)} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><Dialog.Title className="text-lg font-semibold text-gray-900">Apercu</Dialog.Title></div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setViewingBien(null); if (viewingBien) { setEditingBien(viewingBien); setEditorInitialStep(2); setIsAddOpen(true); } }} className="flex items-center gap-2 px-4 py-2 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50"><span>Modifier visibilite</span></button>
              <button onClick={() => { setViewingBien(null); if (viewingBien) { setEditingBien(viewingBien); setEditorInitialStep(1); setIsAddOpen(true); } }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Edit2 className="h-4 w-4" /><span>Modifier</span></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">{viewingBien && <BienPreview bien={viewingBien} zones={zoneOptions} onSaveVisibility={handlePreviewVisibilitySave} />}</div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function BienCard({ bien, zones, saveStatus, onEdit, onDuplicate, onDelete, onView }: { bien: Bien; zones: Zone[]; saveStatus?: { state: 'saving' | 'saved' | 'error'; at: number }; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onView: () => void; }) {
  const firstImageMedia = (bien.media || []).find((media) => media.type !== 'video');
  const firstVideoMedia = (bien.media || []).find((media) => media.type === 'video');
  const mainImage = resolveMediaUrl(firstImageMedia?.url) || toYouTubeThumbnailUrl(firstVideoMedia?.url) || ADMIN_IMAGE_FALLBACK;
  const imageCount = bien.media?.length || 0;
  const terrainMode = bien.terrain_mode_affichage_prix || 'total_et_m2';
  const terrainTotal = Number(bien.terrain_prix_affiche_total ?? bien.prix_affiche_client ?? bien.prix_nuitee ?? 0);
  const terrainParM2 = Number(bien.terrain_prix_affiche_par_m2 ?? 0);
  const displayPrice = bien.mode === 'vente'
    ? (bien.type === 'terrain' && terrainMode === 'm2_uniquement' && terrainParM2 > 0
      ? terrainParM2
      : Number(bien.prix_affiche_client ?? terrainTotal ?? bien.prix_nuitee ?? 0))
    : Number(bien.prix_nuitee || 0);
  const currentPricing = resolveCurrentPricing({
    defaultNightlyPrice: Number(bien.prix_nuitee || 0),
    defaultWeeklyPrice: Number(bien.prix_semaine || 0),
    pricingPeriods: Array.isArray(bien.pricing_periods)
      ? bien.pricing_periods.map((period) => ({
          id: period.id,
          start: String(period.start || ''),
          end: String(period.end || ''),
          prix_nuitee: Number(period.prix_nuitee || 0),
          prix_semaine: period.prix_semaine === null || period.prix_semaine === undefined ? null : Number(period.prix_semaine || 0),
          minimum_nuitees: period.minimum_nuitees === null || period.minimum_nuitees === undefined ? null : Number(period.minimum_nuitees || 0),
          checkin_jour: period.checkin_jour || null,
          checkout_jour: period.checkout_jour || null,
          scope: String(period.scope || '').trim().toLowerCase() === 'amicale'
            ? 'amicale'
            : (String(period.scope || '').trim().toLowerCase() === 'amicales' ? 'amicales' : (String(period.amicale_id || '').trim() ? 'amicale' : 'global')),
          amicale_id: period.amicale_id || null,
        }))
      : [],
  });
  const syncedNightlyPrice = bien.mode === 'vente'
    ? Number(displayPrice || 0)
    : currentPricing.nightlyPrice;
  const syncedWeeklyPrice = bien.mode === 'vente'
    ? 0
    : currentPricing.weeklyPrice;
  const priceSuffix = bien.mode === 'vente'
    ? (bien.type === 'terrain' && terrainMode === 'm2_uniquement' ? '/m2' : '')
    : '/nuit';
  const persistedSavedAt = bien?.admin_last_saved_at ? new Date(String(bien.admin_last_saved_at)).getTime() : null;
  const resolvedSavedAt = Number.isFinite(saveStatus?.at as number)
    ? (saveStatus?.at as number)
    : (Number.isFinite(persistedSavedAt as number) ? (persistedSavedAt as number) : null);
  const effectiveSaveState: 'saving' | 'saved' | 'error' | null = saveStatus?.state || (resolvedSavedAt ? 'saved' : null);
  const saveDateLabel = resolvedSavedAt
    ? new Date(resolvedSavedAt).toLocaleString('fr-FR', { hour12: false })
    : '';
  return (
    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full group ${bien.is_featured ? 'border-amber-300 shadow-amber-100/80' : 'border-gray-200'}`}>
      <div className="relative h-44 sm:h-48 bg-gray-100 overflow-hidden">
        <SmartImage
          src={mainImage}
          alt={bien.titre}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          targetWidth={640}
          quality={60}
        />
        {bien.is_featured && (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-amber-300/25 via-transparent to-amber-500/20 pointer-events-none" />
            <div className="absolute inset-0 ring-1 ring-amber-300/60 ring-inset pointer-events-none" />
            <div className="absolute top-3 right-3 bg-amber-500 text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-md">Vedette</div>
          </>
        )}
        <div className="absolute top-3 left-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors[bien.statut]}`}>{statusLabels[bien.statut]}</span></div>
        {imageCount > 1 && <div className={`absolute top-3 ${bien.is_featured ? 'right-20' : 'right-3'} bg-black/50 text-white px-2 py-1 rounded-lg text-xs`}><ImageIcon className="h-3 w-3 inline" /> {imageCount}</div>}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button onClick={onView} className="p-2 bg-white rounded-full hover:bg-gray-100"><Eye className="h-4 w-4 text-gray-700" /></button>
          <button onClick={onEdit} className="p-2 bg-white rounded-full hover:bg-gray-100"><Edit2 className="h-4 w-4 text-emerald-600" /></button>
          <button onClick={onDuplicate} className="p-2 bg-white rounded-full hover:bg-gray-100"><Copy className="h-4 w-4 text-blue-600" /></button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <p className="text-white font-bold text-lg">
            {syncedNightlyPrice} DT{priceSuffix ? <span className="text-xs font-normal text-white/80">{priceSuffix}</span> : null}
          </p>
          {bien.mode !== 'vente' && syncedWeeklyPrice > 0 ? (
            <p className="text-white/90 text-xs font-medium">
              {syncedWeeklyPrice} DT / semaine
            </p>
          ) : null}
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="mb-3"><h3 className="font-bold text-gray-900 text-base line-clamp-1 mb-1">{bien.titre}</h3><div className="flex items-center gap-1 text-gray-500 text-xs"><MapPin className="h-3 w-3" /><span>{zones.find(z => z.id === bien.zone_id)?.nom || 'Zone Inconnue'}</span></div></div>
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-4"><div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded"><Bed className="h-3 w-3" /><span>{bien.nb_chambres}</span></div><div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded"><Bath className="h-3 w-3" /><span>{bien.nb_salle_bain}</span></div><div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded"><Banknote className="h-3 w-3" /><span>{bien.avance} DT</span></div></div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2"><span className="px-2 py-1 bg-gray-100 rounded font-medium">{typeLabels[bien.type]}</span><span>Ref: {bien.reference}</span></div>
        {effectiveSaveState && (
          <div className="mb-3 text-[11px]">
            {effectiveSaveState === 'saving' && <span className="inline-flex items-center gap-1 text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />Sauvegarde en cours...</span>}
            {effectiveSaveState === 'saved' && <span className="inline-flex items-center gap-1 text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />Sauvegarde: {saveDateLabel}</span>}
            {effectiveSaveState === 'error' && <span className="inline-flex items-center gap-1 text-red-700"><span className="h-2 w-2 rounded-full bg-red-500" />Echec sauvegarde: {saveDateLabel}</span>}
          </div>
        )}
        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-100">
          <button onClick={onView} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium"><Eye className="h-4 w-4" /></button>
          <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium"><Edit2 className="h-4 w-4" /></button>
          <button onClick={onDuplicate} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg font-medium"><Copy className="h-4 w-4" /></button>
          <button onClick={onDelete} className="flex-1 flex items-center justify-center p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

function BienEditor({ initialData, seedData, zones, proprietaires, existingBiens, onSubmit }: { initialData: Bien | null; seedData?: Bien | null; zones: Zone[]; proprietaires: Proprietaire[]; existingBiens: Bien[]; onSubmit: (data: Bien) => void | Promise<void>; onCancel: () => void; }) {
  const [activeTab, setActiveTab] = useState<'general' | 'images' | 'calendar'>('general');
  const [generalStep, setGeneralStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [formData, setFormData] = useState<Partial<Bien>>(initialData || seedData || { reference: '', titre: '', nom_bien_mobile: '', description: '', mode: 'location_saisonniere' as BienMode, type: 'appartement' as BienType, nb_chambres: 0, nb_salle_bain: 0, prix_nuitee: 0, prix_semaine: 0, tarification_methode: 'avec_commission' as TarificationMethodeVente, prix_affiche_client: 0, prix_fixe_proprietaire: 0, prix_proprietaire: 0, prix_final: 0, revenu_agence: 0, commission_pourcentage_proprietaire: DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT, commission_pourcentage_client: DEFAULT_COMMISSION_CLIENT_PERCENT, montant_max_reduction_negociation: 0, prix_minimum_accepte: 0, modalite_paiement_vente: 'comptant' as ModalitePaiementVente, pourcentage_premiere_partie_promesse: DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE, montant_premiere_partie_promesse: 0, montant_deuxieme_partie: 0, nombre_tranches: 6, periode_tranches_mois: 6, montant_par_tranche: 0, avance: 0, caution: 0, type_rue: null, type_papier: null, superficie_m2: null, etage: null, configuration: null, annee_construction: null, distance_plage_m: null, proche_plage: false, chauffage_central: false, climatisation: false, balcon: false, terrasse: false, ascenseur: false, vue_mer: false, gaz_ville: false, cuisine_equipee: false, place_parking: false, syndic: false, meuble: false, independant: false, eau_puits: false, eau_sonede: false, electricite_steg: false, surface_local_m2: null, facade_m: null, hauteur_plafond_m: null, activite_recommandee: null, toilette: false, reserve_local: false, vitrine: false, coin_angle: false, electricite_3_phases: false, alarme: false, type_terrain: null, terrain_facade_m: null, terrain_surface_m2: null, terrain_distance_plage_m: null, terrain_zone: null, terrain_constructible: false, terrain_angle: false, terrain_prix_affiche_total: null, terrain_prix_affiche_par_m2: null, terrain_mode_affichage_prix: 'total_et_m2' as ModeAffichagePrixTerrain, terrain_disponibilite_reseaux: [], terrain_hauteur_construction_autorisee: null, terrain_route_acces_largeur_m: null, terrain_forme: null, terrain_topographie: null, terrain_bornage: false, terrain_travaux_municipalite_autorises: false, terrain_limites_cadastrales: false, terrain_visualisation_limites_cadastrales: false, terrain_voisinage: null, terrain_proximites_commodites: [], terrain_proximites_commodites_autres: null, terrain_viabilisation_eau_sources: [], terrain_viabilisation_onas: null, terrain_viabilisation_steg: null, terrain_viabilisation_gaz_ville: false, terrain_viabilisation_fibre_optique: false, terrain_viabilisation_telephone_fixe: false, terrain_type_sol: null, terrain_vegetation: null, terrain_niveau_sonore: null, terrain_risque_inondation: false, terrain_exposition_vent: null, terrain_ideal_utilisations: [], terrain_documents_disponibles: [], lotissement_nb_terrains: 1, lotissement_prix_total: null, lotissement_mode_prix_m2: 'm2_unique' as ModePrixLotissement, lotissement_prix_m2_unique: null, lotissement_terrains: [], lotissement_paliers_prix_m2: [], immeuble_surface_terrain_m2: null, immeuble_surface_batie_m2: null, immeuble_nb_niveaux: null, immeuble_nb_garages: null, immeuble_nb_appartements: null, immeuble_nb_locaux_commerciaux: null, immeuble_distance_plage_m: null, immeuble_proche_plage: false, immeuble_ascenseur: false, immeuble_parking_sous_sol: false, immeuble_parking_exterieur: false, immeuble_syndic: false, immeuble_vue_mer: false, immeuble_appartements: [], immeuble_garages: [], immeuble_locaux_commerciaux: [], statut: 'disponible' as BienStatut, visible_sur_site: true, is_featured: false, ui_config: null, menage_en_cours: false, zone_id: zones[0]?.id || '', proprietaire_id: proprietaires[0]?.id || '' });
  const saisonConfig: LocationSaisonniereConfig = {
    ...DEFAULT_LOCATION_SAISONNIERE_CONFIG,
    ...((formData.location_saisonniere_config || {}) as LocationSaisonniereConfig),
  };
  const selectedZone = zones.find((item) => item.id === formData.zone_id);
  const toOuiNon = (value: boolean | null | undefined) => value ? 'Oui' : 'Non';
  const normalizeMapsInput = (raw?: string | null) => {
    const value = String(raw || '').trim();
    if (!value) return null;
    const iframeSrcMatch = value.match(/<iframe[^>]*\s+src=["']([^"']+)["']/i);
    const extracted = iframeSrcMatch?.[1] || value;
    return extracted.replace(/&amp;/g, '&').trim() || null;
  };
  const bienMapsNormalizedUrl = useMemo(
    () => normalizeMapsInput(saisonConfig.google_maps_embed_url),
    [saisonConfig.google_maps_embed_url]
  );
  const bienMapsCoordinates = useMemo(
    () => extractGoogleMapsLatLng(bienMapsNormalizedUrl),
    [bienMapsNormalizedUrl]
  );
  const bienMapsCoordinatesLabel = bienMapsCoordinates
    ? `${bienMapsCoordinates.lat.toFixed(6)}, ${bienMapsCoordinates.lng.toFixed(6)}`
    : null;
  const updateSaisonConfig = (patch: Partial<LocationSaisonniereConfig>) => {
    setFormData((prev) => ({
      ...prev,
      location_saisonniere_config: {
        ...DEFAULT_LOCATION_SAISONNIERE_CONFIG,
        ...((prev.location_saisonniere_config || {}) as LocationSaisonniereConfig),
        ...patch,
      },
    }));
  };
  const [zonesOptions, setZonesOptions] = useState<Zone[]>(zones);
  const [proprietaireOptions, setProprietaireOptions] = useState<Proprietaire[]>(proprietaires);
  const [images, setImages] = useState<Media[]>(initialData?.media || seedData?.media || []);
  const [deletedMediaIds, setDeletedMediaIds] = useState<string[]>([]);
  const [unavailableDates, setUnavailableDates] = useState<DateStatus[]>(initialData?.unavailableDates || seedData?.unavailableDates || []);
  const [pricingPeriods, setPricingPeriods] = useState<SeasonalPricingPeriod[]>(initialData?.pricing_periods || seedData?.pricing_periods || []);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [removedUiBlocks, setRemovedUiBlocks] = useState<Record<string, boolean>>({});
  const [newImageMotif, setNewImageMotif] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showFeaturePanel, setShowFeaturePanel] = useState(false);
  const [newFeature, setNewFeature] = useState('');
  const [newFeatureType, setNewFeatureType] = useState<'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte'>('simple');
  const [newFeatureChoices, setNewFeatureChoices] = useState('');
  const [newFeatureUnit, setNewFeatureUnit] = useState('');
  const [newFeatureIconName, setNewFeatureIconName] = useState('');
  const [openFeatureIconPickerId, setOpenFeatureIconPickerId] = useState<string | null>('new');
  const [newFeatureVisibilite, setNewFeatureVisibilite] = useState<0 | 1>(1);
  const [featureTabs, setFeatureTabs] = useState<CaracteristiqueOnglet[]>([]);
  const [featureTabDrafts, setFeatureTabDrafts] = useState<Record<string, string>>({});
  const [selectedFeatureTabId, setSelectedFeatureTabId] = useState<string>('');
  const [newFeatureTabName, setNewFeatureTabName] = useState('');
  const [featureDrafts, setFeatureDrafts] = useState<Record<string, { nom: string; type_caracteristique: 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte'; choix: string; unite: string; icon_name: string; onglet_id: string; visibilite_client: 0 | 1 }>>({});
  const [featureSaving, setFeatureSaving] = useState(false);
  const [availableFeatures, setAvailableFeatures] = useState<Caracteristique[]>([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>(initialData?.caracteristique_ids || seedData?.caracteristique_ids || []);
  const [featureChoiceValuesById, setFeatureChoiceValuesById] = useState<Record<string, string[]>>({});
  const [featureMultiChoicePickerById, setFeatureMultiChoicePickerById] = useState<Record<string, string>>({});
  const [featureValueById, setFeatureValueById] = useState<Record<string, string>>({});
  const [newSousTypeChoice, setNewSousTypeChoice] = useState('');
  const [isSavingSousTypeChoice, setIsSavingSousTypeChoice] = useState(false);
  const [sousTypeImportMode, setSousTypeImportMode] = useState<BienMode>('location_saisonniere');
  const [sousTypeImportType, setSousTypeImportType] = useState<BienType>('appartement');
  const [isImportingSousTypes, setIsImportingSousTypes] = useState(false);
  const [isDeletingSousTypeChoice, setIsDeletingSousTypeChoice] = useState(false);
  const [restoredFeatureLines, setRestoredFeatureLines] = useState<string[]>([]);
  const [restoredFeatureValuesApplied, setRestoredFeatureValuesApplied] = useState(false);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddProprietaire, setShowAddProprietaire] = useState(false);
  const [newZonePays, setNewZonePays] = useState('');
  const [newZoneGouvernerat, setNewZoneGouvernerat] = useState('');
  const [newZoneRegion, setNewZoneRegion] = useState('');
  const [newZoneQuartier, setNewZoneQuartier] = useState('');
  const [newZoneGoogleMapsUrl, setNewZoneGoogleMapsUrl] = useState('');
  const [newZoneImageFile, setNewZoneImageFile] = useState<File | null>(null);
  const [newZoneImagePreview, setNewZoneImagePreview] = useState('');
  const [newZoneImageUploading, setNewZoneImageUploading] = useState(false);
  const [selectedZoneImageFile, setSelectedZoneImageFile] = useState<File | null>(null);
  const [selectedZoneImagePreview, setSelectedZoneImagePreview] = useState('');
  const [selectedZoneImageUploading, setSelectedZoneImageUploading] = useState(false);
  const [selectedZoneImageTarget, setSelectedZoneImageTarget] = useState<'quartier' | 'region' | 'gouvernerat' | 'pays'>('pays');
  const [newOwnerFirstName, setNewOwnerFirstName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerCin, setNewOwnerCin] = useState('');
  const [isReferenceManuallyEdited, setIsReferenceManuallyEdited] = useState(Boolean(initialData?.reference));
  const [hasSeededDefaultPaidServices, setHasSeededDefaultPaidServices] = useState(Boolean(initialData));
  const [draggedImageIndex, setDraggedImageIndex] = useState<string | null>(null);
  const [validationDialogState, setValidationDialogState] = useState<{ open: boolean; issues: ValidationIssue[] }>({ open: false, issues: [] });
  const removeUiBlock = (key: string) => {
    setRemovedUiBlocks((prev) => ({ ...prev, [key]: true }));
  };
  const [zoneDeleteDialog, setZoneDeleteDialog] = useState<DeleteRelationDialogState>({
    open: false,
    sourceId: '',
    sourceLabel: '',
    linkedBiens: [],
    targetId: '',
    loading: false,
    submitting: false,
  });
  const [ownerDeleteDialog, setOwnerDeleteDialog] = useState<DeleteRelationDialogState>({
    open: false,
    sourceId: '',
    sourceLabel: '',
    linkedBiens: [],
    targetId: '',
    loading: false,
    submitting: false,
  });
  const [featureExistsDialog, setFeatureExistsDialog] = useState<FeatureExistsDialogState>({
    open: false,
    featureName: '',
    mode: 'location_saisonniere',
    type: 'appartement',
    canAddToCurrentContext: false,
    payload: null,
  });
  const [validatedSteps, setValidatedSteps] = useState<Set<number>>(new Set(initialData ? [1, 2, 3, 4, 5] : []));
  const [terrainSectionTab, setTerrainSectionTab] = useState<TerrainSectionTab>('informations_generales');
  const [detailSectionTabId, setDetailSectionTabId] = useState<string>('informations_generales');
  const [selectedServiceCatalogId, setSelectedServiceCatalogId] = useState<string>('');
  const [serviceCatalogueOptions, setServiceCatalogueOptions] = useState<ServicePayantBien[]>(LOCATION_SAISONNIERE_SERVICES_CATALOGUE_FALLBACK);
  const [serviceCatalogueDrafts, setServiceCatalogueDrafts] = useState<Record<string, ServicePayantBien>>({});
  const [isCatalogueManagerOpen, setIsCatalogueManagerOpen] = useState(false);
  const [catalogueActionId, setCatalogueActionId] = useState<string | null>(null);
  const [newCatalogueService, setNewCatalogueService] = useState<ServicePayantBien>(normalizeServicePayant({
    id: '',
    categorie: 'Services client',
    label: '',
    description_courte: '',
    prix: 0,
    prix_affiche: '',
    type_tarification: 'fixe',
    enabled: true,
  }));
  const detailTabsNavRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setDeletedMediaIds([]);
  }, [initialData?.id]);
  const normalizeLegacyType = (value?: BienType): BienType => {
    if (value === 'S1' || value === 'S2' || value === 'S3' || value === 'S4') return 'appartement';
    if (value === 'villa') return 'villa_maison';
    if (value === 'local') return 'local_commercial';
    return (value || 'appartement') as BienType;
  };
  const MODE_REFERENCE_CODES: Record<BienMode, string> = {
    vente: 'VENTE',
    location_annuelle: 'LOCANNUELLE',
    location_saisonniere: 'LOCSAISONNIERE',
  };
  const TYPE_REFERENCE_CODES: Record<BienType, string> = {
    appartement: 'APP',
    villa_maison: 'VILLA',
    studio: 'STU',
    immeuble: 'IMM',
    terrain: 'TER',
    lotissement: 'LOT',
    local_commercial: 'LCOM',
    bungalow: 'BUN',
    S1: 'APP',
    S2: 'APP',
    S3: 'APP',
    S4: 'APP',
    villa: 'VILLA',
    local: 'LOC',
  };
  const TYPE_UNIT_PREFIX: Record<BienType, string> = {
    appartement: 'A',
    villa_maison: 'V',
    studio: 'S',
    immeuble: 'I',
    terrain: 'T',
    lotissement: 'L',
    local_commercial: 'C',
    bungalow: 'B',
    S1: 'A',
    S2: 'A',
    S3: 'A',
    S4: 'A',
    villa: 'V',
    local: 'C',
  };
  const refreshServiceCatalogue = async (options?: { fallbackOnError?: boolean }) => {
    const fallbackOnError = options?.fallbackOnError !== false;
    try {
      const response = await fetch(`${API_URL}/services-payants/catalogue`);
      if (!response.ok) throw new Error('catalogue');
      const data = await response.json();
      const normalized = Array.isArray(data) ? data.map((service) => normalizeServicePayant(service)) : [];
      const nextOptions = normalized.length > 0 ? normalized : LOCATION_SAISONNIERE_SERVICES_CATALOGUE_FALLBACK;
      setServiceCatalogueOptions(nextOptions);
      setServiceCatalogueDrafts(
        nextOptions.reduce((acc, service) => {
          acc[String(service.id || '')] = normalizeServicePayant(service);
          return acc;
        }, {} as Record<string, ServicePayantBien>)
      );
    } catch {
      if (fallbackOnError) {
        setServiceCatalogueOptions(LOCATION_SAISONNIERE_SERVICES_CATALOGUE_FALLBACK);
        setServiceCatalogueDrafts(
          LOCATION_SAISONNIERE_SERVICES_CATALOGUE_FALLBACK.reduce((acc, service) => {
            acc[String(service.id || '')] = normalizeServicePayant(service);
            return acc;
          }, {} as Record<string, ServicePayantBien>)
        );
      }
      throw new Error('catalogue');
    }
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refreshServiceCatalogue({ fallbackOnError: true });
      } catch {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const normalizeAnnonceKey = (titre?: string | null, zoneId?: string | null, proprietaireId?: string | null) =>
    `${String(titre || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()}__${String(zoneId || '')}__${String(proprietaireId || '')}`;
  const generateReference = () => {
    const mode = (formData.mode || 'location_saisonniere') as BienMode;
    const type = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const modeCode = MODE_REFERENCE_CODES[mode] || 'MODE';
    const typeCode = TYPE_REFERENCE_CODES[type] || 'TYPE';
    const unitPrefix = TYPE_UNIT_PREFIX[type] || 'U';
    const pattern = new RegExp(`^REF-${modeCode}-${typeCode}-ANN(\\d+)-([A-Z])(\\d+)$`);

    const filtered = existingBiens.filter((bien) => bien.mode === mode && normalizeLegacyType(bien.type) === type && (!initialData || bien.id !== initialData.id));
    let maxAnnonceNumber = 0;
    let annonceNumberForCurrent: number | null = null;
    let maxUnitForCurrentAnnonce = 0;
    const annonceKey = normalizeAnnonceKey(formData.titre, formData.zone_id, formData.proprietaire_id);

    for (const bien of filtered) {
      const parsed = pattern.exec(String(bien.reference || '').trim().toUpperCase());
      if (!parsed) continue;
      const ann = Number(parsed[1] || 0);
      const unit = String(parsed[2] || '');
      const unitNo = Number(parsed[3] || 0);
      maxAnnonceNumber = Math.max(maxAnnonceNumber, ann);
      const bienAnnonceKey = normalizeAnnonceKey(bien.titre, bien.zone_id, bien.proprietaire_id);
      if (bienAnnonceKey === annonceKey) {
        if (!annonceNumberForCurrent) annonceNumberForCurrent = ann;
        if (annonceNumberForCurrent === ann && unit === unitPrefix) {
          maxUnitForCurrentAnnonce = Math.max(maxUnitForCurrentAnnonce, unitNo);
        }
      }
    }

    const annNumber = annonceNumberForCurrent || (maxAnnonceNumber + 1);
    const unitNumber = maxUnitForCurrentAnnonce + 1;
    return `REF-${modeCode}-${typeCode}-ANN${annNumber}-${unitPrefix}${unitNumber}`;
  };
  const normalizeReferenceBase = (value?: string | null) => {
    const base = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    return base || 'REF';
  };
  const generateChildReference = (prefix: 'APT' | 'GAR' | 'LOC' | 'TRN', index: number) =>
    `${normalizeReferenceBase(formData.reference)}-${prefix}${index}`;
  const currentProofTypeRueMotif = buildProofMotif(
    PROOF_MOTIF_TYPE_RUE,
    (formData.mode || 'location_saisonniere') as BienMode,
    normalizeLegacyType((formData.type || 'appartement') as BienType)
  );
  const currentProofTypePapierMotif = buildProofMotif(
    PROOF_MOTIF_TYPE_PAPIER,
    (formData.mode || 'location_saisonniere') as BienMode,
    normalizeLegacyType((formData.type || 'appartement') as BienType)
  );
  const isProofImage = (img: Media) => isProofMotif(img.motif_upload);
  const clientVisibleImages = images.filter((img) => img.type === 'image' && !isProofImage(img));
  const clientVisibleVideos = images.filter((img) => img.type === 'video');
  const [facebookDirectVideoUrls, setFacebookDirectVideoUrls] = useState<Record<string, string>>({});
  const [facebookEmbedUnavailableByUrl, setFacebookEmbedUnavailableByUrl] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const uniqueFacebookUrls = Array.from(
      new Set(
        clientVisibleVideos
          .map((video) => String(video.url || '').trim())
          .filter((url) => url && isFacebookVideoUrl(url) && !facebookDirectVideoUrls[url])
      )
    );
    if (uniqueFacebookUrls.length === 0) return;
    let cancelled = false;
    void (async () => {
      const nextEntries: Array<[string, string]> = [];
      for (const url of uniqueFacebookUrls) {
        try {
          const response = await fetch(`${API_URL}/facebook/video-source?url=${encodeURIComponent(url)}`);
          if (!response.ok) continue;
          const payload = await response.json().catch(() => null);
          const source = String(payload?.source || '').trim();
          if (source) nextEntries.push([url, source]);
        } catch {
          // Ignore fetch failures and keep iframe/link fallback.
        }
      }
      if (!cancelled && nextEntries.length > 0) {
        setFacebookDirectVideoUrls((prev) => ({ ...prev, ...Object.fromEntries(nextEntries) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_URL, clientVisibleVideos, facebookDirectVideoUrls]);
  useEffect(() => {
    const uniqueFacebookUrls = Array.from(
      new Set(
        clientVisibleVideos
          .map((video) => String(video.url || '').trim())
          .filter((url) => url && isFacebookVideoUrl(url) && facebookEmbedUnavailableByUrl[url] === undefined)
      )
    );
    if (uniqueFacebookUrls.length === 0) return;
    let cancelled = false;
    void (async () => {
      const updates: Array<[string, boolean]> = [];
      for (const url of uniqueFacebookUrls) {
        try {
          const response = await fetch(`${API_URL}/facebook/embed-status?url=${encodeURIComponent(url)}`);
          const payload = await response.json().catch(() => null);
          updates.push([url, payload?.embeddable === false]);
        } catch {
          updates.push([url, false]);
        }
      }
      if (!cancelled && updates.length > 0) {
        setFacebookEmbedUnavailableByUrl((prev) => ({ ...prev, ...Object.fromEntries(updates) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_URL, clientVisibleVideos, facebookEmbedUnavailableByUrl]);
  const typeRueProofImages = images.filter((img) => img.motif_upload === currentProofTypeRueMotif);
  const typePapierProofImages = images.filter((img) => img.motif_upload === currentProofTypePapierMotif);
  const getLotissementTerrainProofs = (
    proofType: typeof PROOF_MOTIF_TYPE_RUE | typeof PROOF_MOTIF_TYPE_PAPIER,
    terrainIndex: number
  ) => {
    const unitKey = `terrain_${terrainIndex}`;
    const motif = buildProofMotif(
      proofType,
      (formData.mode || 'location_saisonniere') as BienMode,
      normalizeLegacyType((formData.type || 'appartement') as BienType),
      unitKey
    );
    return images.filter((img) => img.motif_upload === motif);
  };
  const getImmeubleAppartementProofs = (
    proofType: typeof PROOF_MOTIF_TYPE_RUE | typeof PROOF_MOTIF_TYPE_PAPIER,
    appartementIndex: number
  ) => {
    const unitKey = `appartement_${appartementIndex}`;
    const motif = buildProofMotif(
      proofType,
      (formData.mode || 'location_saisonniere') as BienMode,
      normalizeLegacyType((formData.type || 'appartement') as BienType),
      unitKey
    );
    return images.filter((img) => img.motif_upload === motif);
  };
  const getUnitClientImages = (unitKey: string) => {
    const motif = buildUnitGalleryMotif(
      (formData.mode || 'location_saisonniere') as BienMode,
      normalizeLegacyType((formData.type || 'appartement') as BienType),
      unitKey
    );
    return clientVisibleImages.filter((img) => img.motif_upload === motif);
  };

  useEffect(() => {
    const sourceData = initialData || seedData || null;
    const rawDescription = sourceData?.description || '';
    const markerIndex = rawDescription.indexOf(CHARACTERISTICS_MARKER);
    const normalizedType = normalizeLegacyType((sourceData?.type || formData.type) as BienType);
    const resolvedMode = (sourceData?.mode || 'location_saisonniere') as BienMode;
    const allowedTypes = BIEN_TYPES_BY_MODE[resolvedMode] || BIEN_TYPES_BY_MODE.location_saisonniere;
    if (markerIndex >= 0) {
      const cleanDescription = rawDescription.slice(0, markerIndex).trim();
      const rawJsonPart = rawDescription.slice(markerIndex + CHARACTERISTICS_MARKER.length).trim();
      let parsedFeatureLines: string[] = [];
      try {
        const parsed = JSON.parse(rawJsonPart);
        if (Array.isArray(parsed)) {
          parsedFeatureLines = parsed.map((item) => String(item || '').trim()).filter(Boolean);
        }
      } catch {
        parsedFeatureLines = [];
      }
      setFormData((prev) => ({
        ...prev,
        description: cleanDescription,
        mode: resolvedMode,
        type: allowedTypes.includes(normalizedType) ? normalizedType : allowedTypes[0],
        reference: prev.reference || generateReference(),
      }));
      setRestoredFeatureLines(parsedFeatureLines);
      setRestoredFeatureValuesApplied(false);
    } else {
      setFormData((prev) => ({
        ...prev,
        mode: resolvedMode,
        type: allowedTypes.includes(normalizedType) ? normalizedType : allowedTypes[0],
        reference: prev.reference || generateReference(),
      }));
      setRestoredFeatureLines([]);
      setRestoredFeatureValuesApplied(false);
    }
    setSelectedFeatureIds(sourceData?.caracteristique_ids || []);
    setImages(sourceData?.media || []);
    setUnavailableDates(sourceData?.unavailableDates || []);
    setPricingPeriods(sourceData?.pricing_periods || []);
    setIsReferenceManuallyEdited(Boolean(initialData?.reference));
    setHasSeededDefaultPaidServices(Boolean(sourceData));
  }, [initialData, seedData]);

  useEffect(() => {
    const bienId = String(initialData?.id || '').trim();
    if (!bienId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/unavailable-dates/${encodeURIComponent(bienId)}`, { credentials: 'include' });
        if (!response.ok) return;
        const rows = await response.json().catch(() => []);
        const normalizedRows = (Array.isArray(rows) ? rows : [])
          .map((row: any) => {
            const start = String(row?.start_date || '').slice(0, 10);
            const end = String(row?.end_date || '').slice(0, 10);
            const rawStatus = String(row?.status || '').trim().toLowerCase();
            const status: 'blocked' | 'pending' | 'booked' = rawStatus === 'booked' || rawStatus === 'pending' || rawStatus === 'blocked'
              ? rawStatus
              : 'blocked';
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return null;
            return {
              id: row?.id ? String(row.id) : undefined,
              start,
              end,
              status,
              color: status === 'booked' ? '#ef4444' : status === 'pending' ? '#f97316' : '#111827',
              paymentDeadline: row?.paymentDeadline || row?.payment_deadline || undefined,
              reservationDemandId: row?.reservation_demand_id ? String(row.reservation_demand_id) : null,
            } satisfies DateStatus;
          })
          .filter((row): row is DateStatus => Boolean(row));
        if (!cancelled) {
          setUnavailableDates(normalizedRows);
        }
      } catch {
        // Keep initial unavailable dates as fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData?.id]);

  useEffect(() => { setZonesOptions(zones); }, [zones]);
  useEffect(() => { setProprietaireOptions(proprietaires); }, [proprietaires]);
  useEffect(() => {
    if (initialData || hasSeededDefaultPaidServices) return;
    if ((formData.mode || 'location_saisonniere') !== 'location_saisonniere') return;
    const nextDefaults = buildDefaultPaidServices(serviceCatalogueOptions);
    if (nextDefaults.length === 0) return;
    setFormData((prev) => {
      const currentConfig = {
        ...DEFAULT_LOCATION_SAISONNIERE_CONFIG,
        ...((prev.location_saisonniere_config || {}) as LocationSaisonniereConfig),
      };
      const currentServices = Array.isArray(currentConfig.services_payants) ? currentConfig.services_payants : [];
      if (currentServices.length > 0) return prev;
      return {
        ...prev,
        location_saisonniere_config: {
          ...currentConfig,
          services_payants: nextDefaults,
        },
      };
    });
    setHasSeededDefaultPaidServices(true);
  }, [initialData, hasSeededDefaultPaidServices, formData.mode, serviceCatalogueOptions]);
  useEffect(() => {
    const currentMode = (formData.mode || 'location_saisonniere') as BienMode;
    if (currentMode === 'vente' && activeTab === 'calendar') {
      setActiveTab('general');
    }
  }, [formData.mode, activeTab]);
  useEffect(() => {
    const currentMode = (formData.mode || 'location_saisonniere') as BienMode;
    const currentType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    if (!(currentMode === 'vente' && currentType === 'terrain')) {
      setTerrainSectionTab('informations_generales');
    }
  }, [formData.mode, formData.type]);
  useEffect(() => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType(formData.type as BienType);
    if (!selectedMode || !selectedType) {
      setAvailableFeatures([]);
      setFeatureTabs([]);
      return;
    }

    let cancelled = false;
    const run = async () => {
      if (selectedMode === 'location_saisonniere' && selectedType !== 'appartement') {
        await syncSaisonniereTemplateFromAppartement(selectedMode, selectedType);
      }
      if (cancelled) return;
      await loadFeatureTabs(selectedMode, selectedType);
      if (cancelled) return;
      await loadAvailableFeatures(selectedMode, selectedType);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [formData.mode, formData.type]);
  useEffect(() => {
    const allowed = BIEN_TYPES_BY_MODE[sousTypeImportMode] || BIEN_TYPES_BY_MODE.location_saisonniere;
    if (!allowed.includes(sousTypeImportType)) {
      setSousTypeImportType(allowed[0]);
    }
  }, [sousTypeImportMode, sousTypeImportType]);
  useEffect(() => {
    const currentMode = (formData.mode || 'location_saisonniere') as BienMode;
    const currentType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    if (sousTypeImportMode !== currentMode) {
      setSousTypeImportMode(currentMode);
    }
    if (sousTypeImportType !== currentType) {
      setSousTypeImportType(currentType);
    }
  }, [formData.mode, formData.type]);
  useEffect(() => {
    if (!Array.isArray(availableFeatures) || availableFeatures.length === 0) return;
    const allowedIds = new Set(availableFeatures.map((feature) => String(feature.id || '')));
    setSelectedFeatureIds((prev) => prev.filter((id) => allowedIds.has(String(id || ''))));
    setFeatureChoiceValuesById((prev) => {
      const next: Record<string, string[]> = {};
      Object.entries(prev).forEach(([id, values]) => {
        if (allowedIds.has(id)) next[id] = Array.isArray(values) ? values : [];
      });
      return next;
    });
    setFeatureMultiChoicePickerById((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([id, value]) => {
        if (allowedIds.has(id)) next[id] = String(value || '');
      });
      return next;
    });
    setFeatureValueById((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([id, value]) => {
        if (allowedIds.has(id)) next[id] = String(value || '');
      });
      return next;
    });
  }, [availableFeatures]);

  useEffect(() => {
    if (restoredFeatureValuesApplied) return;
    if (!Array.isArray(availableFeatures) || availableFeatures.length === 0) return;

    const sourceCaracteristiqueIds = (initialData?.caracteristique_ids || seedData?.caracteristique_ids || []).map((id) => String(id || ''));
    const sourceCaracteristiqueValeurs = (
      ((initialData as any)?.caracteristique_valeurs as Record<string, unknown> | undefined)
      || ((seedData as any)?.caracteristique_valeurs as Record<string, unknown> | undefined)
      || {}
    );
    const sourceChoiceValues: Record<string, string[]> = {};
    const sourceValueById: Record<string, string> = {};
    for (const feature of availableFeatures) {
      const featureId = String(feature.id || '');
      if (!featureId) continue;
      const rawValue = sourceCaracteristiqueValeurs?.[featureId];
      if (rawValue === undefined || rawValue === null) continue;
      const featureType = normalizeFeatureType(feature.type_caracteristique);
      if (featureType === 'choix_multiple') {
        const first = Array.isArray(rawValue)
          ? String(rawValue[0] || '').trim()
          : String(rawValue || '').split(',').map((item) => item.trim()).filter(Boolean)[0] || '';
        if (first) sourceChoiceValues[featureId] = [first];
        continue;
      }
      if (featureType === 'plusieurs_choix') {
        const values = Array.isArray(rawValue)
          ? rawValue.map((item) => String(item || '').trim()).filter(Boolean)
          : String(rawValue || '').split(',').map((item) => item.trim()).filter(Boolean);
        if (values.length > 0) sourceChoiceValues[featureId] = Array.from(new Set(values));
        continue;
      }
      if (featureType === 'valeur' || featureType === 'texte') {
        const normalized = Array.isArray(rawValue)
          ? String(rawValue[0] || '').trim()
          : String(rawValue || '').trim();
        if (normalized) sourceValueById[featureId] = normalized;
      }
    }

    if (!Array.isArray(restoredFeatureLines) || restoredFeatureLines.length === 0) {
      const allowedIds = new Set(availableFeatures.map((feature) => String(feature.id || '')));
      const preservedInitialIds = sourceCaracteristiqueIds.filter((id) => allowedIds.has(String(id || '')));
      if (preservedInitialIds.length > 0) {
        setSelectedFeatureIds((prev) => Array.from(new Set([...preservedInitialIds, ...prev])));
      }
      setFeatureChoiceValuesById((prev) => ({ ...prev, ...sourceChoiceValues }));
      setFeatureValueById((prev) => ({ ...prev, ...sourceValueById }));
      setRestoredFeatureValuesApplied(true);
      return;
    }

    const featureByNormalizedName = new Map<string, Caracteristique>();
    for (const feature of availableFeatures) {
      featureByNormalizedName.set(normalizeFeatureName(String(feature.nom || '')), feature);
    }

    const nextSelectedIds = new Set<string>(sourceCaracteristiqueIds);
    const nextChoiceValues: Record<string, string[]> = { ...sourceChoiceValues };
    const nextValueById: Record<string, string> = { ...sourceValueById };

    for (const line of restoredFeatureLines) {
      const raw = String(line || '').trim();
      if (!raw) continue;
      const separatorIndex = raw.indexOf(':');
      const rawName = separatorIndex >= 0 ? raw.slice(0, separatorIndex).trim() : raw;
      const rawValue = separatorIndex >= 0 ? raw.slice(separatorIndex + 1).trim() : '';
      const matchedFeature = featureByNormalizedName.get(normalizeFeatureName(rawName));
      if (!matchedFeature) continue;

      const featureId = String(matchedFeature.id || '');
      if (!featureId) continue;
      const featureType = normalizeFeatureType(matchedFeature.type_caracteristique);
      nextSelectedIds.add(featureId);

      if (featureType === 'choix_multiple') {
        if (rawValue) nextChoiceValues[featureId] = [rawValue];
        continue;
      }
      if (featureType === 'plusieurs_choix') {
        const values = rawValue.split(',').map((item) => item.trim()).filter(Boolean);
        if (values.length > 0) nextChoiceValues[featureId] = Array.from(new Set(values));
        continue;
      }
      if (featureType === 'valeur' || featureType === 'texte') {
        if (rawValue) nextValueById[featureId] = rawValue;
      }
    }

    setSelectedFeatureIds(Array.from(nextSelectedIds));
    setFeatureChoiceValuesById((prev) => ({ ...prev, ...nextChoiceValues }));
    setFeatureValueById((prev) => ({ ...prev, ...nextValueById }));
    setRestoredFeatureValuesApplied(true);
  }, [availableFeatures, initialData?.caracteristique_ids, seedData?.caracteristique_ids, restoredFeatureLines, restoredFeatureValuesApplied]);

  useEffect(() => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const isImmeubleModeType = selectedMode === 'vente' && selectedType === 'immeuble';
    const isLotissementModeType = selectedMode === 'vente' && selectedType === 'lotissement';
    const visibleKeys = (Object.keys(UI_SECTION_FEATURE_TAB_DEFINITIONS) as Array<keyof BienUiConfig>)
      .filter((key) => {
        if (key === 'show_immeuble_appartements' && !isImmeubleModeType) return false;
        if (key === 'show_immeuble_garages' && !isImmeubleModeType) return false;
        if (key === 'show_immeuble_locaux_commerciaux' && !isImmeubleModeType) return false;
        if (key === 'show_lotissement_terrains' && !isLotissementModeType) return false;
        return isUiSectionVisible(key);
      });
    if (visibleKeys.length === 0) return;
    void ensureFeatureTabsForCurrentContext(visibleKeys);
  }, [formData.mode, formData.type, formData.ui_config]);

  useEffect(() => {
    const targetCount = Math.max(0, Math.floor(Number(formData.immeuble_nb_appartements || 0)));
    const currentRows = Array.isArray(formData.immeuble_appartements) ? formData.immeuble_appartements : [];
    const needsSync = currentRows.length !== targetCount || currentRows.some((row, idx) => !row?.reference || Number(row?.index || 0) !== (idx + 1));
    if (!needsSync) return;
    const nextRows = [];
    for (let i = 0; i < targetCount; i += 1) {
      const existing = currentRows[i];
      nextRows.push({
        index: i + 1,
        reference: existing?.reference || generateChildReference('APT', i + 1),
        chambres: Number(existing?.chambres || 0),
        salle_bain: Number(existing?.salle_bain || 0),
        superficie_m2: existing?.superficie_m2 ?? null,
        configuration: existing?.configuration || null,
      });
    }
    setFormData((prev) => ({ ...prev, immeuble_appartements: nextRows }));
  }, [formData.immeuble_nb_appartements, formData.reference]);
  useEffect(() => {
    const targetCount = Math.max(0, Math.floor(Number(formData.immeuble_nb_garages || 0)));
    const currentRows = Array.isArray(formData.immeuble_garages) ? formData.immeuble_garages : [];
    const needsSync = currentRows.length !== targetCount || currentRows.some((row, idx) => !row?.reference || Number(row?.index || 0) !== (idx + 1));
    if (!needsSync) return;
    const nextRows = [];
    for (let i = 0; i < targetCount; i += 1) {
      const existing = currentRows[i];
      nextRows.push({
        index: i + 1,
        reference: existing?.reference || generateChildReference('GAR', i + 1),
      });
    }
    setFormData((prev) => ({ ...prev, immeuble_garages: nextRows }));
  }, [formData.immeuble_nb_garages, formData.reference]);
  useEffect(() => {
    const targetCount = Math.max(0, Math.floor(Number(formData.immeuble_nb_locaux_commerciaux || 0)));
    const currentRows = Array.isArray(formData.immeuble_locaux_commerciaux) ? formData.immeuble_locaux_commerciaux : [];
    const needsSync = currentRows.length !== targetCount || currentRows.some((row, idx) => !row?.reference || Number(row?.index || 0) !== (idx + 1));
    if (!needsSync) return;
    const nextRows = [];
    for (let i = 0; i < targetCount; i += 1) {
      const existing = currentRows[i];
      nextRows.push({
        index: i + 1,
        reference: existing?.reference || generateChildReference('LOC', i + 1),
      });
    }
    setFormData((prev) => ({ ...prev, immeuble_locaux_commerciaux: nextRows }));
  }, [formData.immeuble_nb_locaux_commerciaux, formData.reference]);
  useEffect(() => {
    const targetCount = Math.max(1, Math.floor(Number(formData.lotissement_nb_terrains || 1)));
    const currentRows = Array.isArray(formData.lotissement_terrains) ? formData.lotissement_terrains : [];
    const needsSync = currentRows.length !== targetCount || currentRows.some((row, idx) => !row?.reference || Number(row?.index || 0) !== (idx + 1));
    if (!needsSync) return;
    const nextRows = [];
    for (let i = 0; i < targetCount; i += 1) {
      const existing = currentRows[i];
      nextRows.push({
        index: i + 1,
        reference: existing?.reference || generateChildReference('TRN', i + 1),
        type_terrain: (existing?.type_terrain || null),
        surface_m2: existing?.surface_m2 ?? null,
        type_rue: (existing?.type_rue || null),
        type_papier: (existing?.type_papier || null),
        terrain_zone: existing?.terrain_zone || null,
        terrain_distance_plage_m: existing?.terrain_distance_plage_m ?? null,
        terrain_constructible: !!existing?.terrain_constructible,
        terrain_angle: !!existing?.terrain_angle,
      });
    }
    setFormData((prev) => ({ ...prev, lotissement_terrains: nextRows }));
  }, [formData.lotissement_nb_terrains, formData.reference]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, motifOverride?: string | null) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const isLocalCommercial = selectedType === 'local_commercial';
    const resolvedMotif = motifOverride ?? (isLocalCommercial ? newImageMotif.trim() : null);
    if (isLocalCommercial && !resolvedMotif) {
      toast.error("Motif d'upload requis pour le local");
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      let uploadedCount = 0;
      let failedCount = 0;
      for (const file of files) {
        try {
          const uploadFormData = new FormData();
          uploadFormData.append('image', file);
          uploadFormData.append('bien_id', String(formData.id || ''));
          uploadFormData.append('bien_reference', String(formData.reference || ''));
          const response = await fetch(`${API_URL}/upload`, { method: 'POST', body: uploadFormData });
          if (!response.ok) {
            let errorMessage = 'Upload failed';
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const payload = await response.json().catch(() => null);
              errorMessage = String(payload?.error || errorMessage);
            } else {
              errorMessage = await response.text().catch(() => errorMessage);
            }
            throw new Error(errorMessage);
          }
          const data = await response.json();
          const newMedia: Media = {
            id: Math.random().toString(36).substr(2, 9),
            bien_id: '',
            type: String(data.mediaType || '').startsWith('video') ? 'video' : 'image',
            url: data.url,
            motif_upload: resolvedMotif,
          };
          setImages((prev) => [...prev, newMedia]);
          uploadedCount += 1;
        } catch {
          failedCount += 1;
        }
      }
      if (isLocalCommercial && !motifOverride) setNewImageMotif('');
      if (uploadedCount > 0) toast.success(`${uploadedCount}/${files.length} image(s) uploadee(s)`);
      if (failedCount > 0) toast.error(`${failedCount} image(s) ont echoue`);
    } catch {
      toast.error('Erreur upload');
    }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleProofFileUpload = async (
    proofType: typeof PROOF_MOTIF_TYPE_RUE | typeof PROOF_MOTIF_TYPE_PAPIER,
    e: React.ChangeEvent<HTMLInputElement>,
    unitKey?: string
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    try {
      for (const file of files) {
        const uploadFormData = new FormData();
        uploadFormData.append('image', file);
        uploadFormData.append('bien_id', String(formData.id || ''));
        uploadFormData.append('bien_reference', String(formData.reference || ''));
        const response = await fetch(`${API_URL}/upload`, { method: 'POST', body: uploadFormData });
        if (!response.ok) {
          continue;
        }
        const data = await response.json();
        const newMedia: Media = {
          id: Math.random().toString(36).substr(2, 9),
          bien_id: formData.id || '',
          type: 'image',
          url: data.url,
          motif_upload: buildProofMotif(
            proofType,
            (formData.mode || 'location_saisonniere') as BienMode,
            normalizeLegacyType((formData.type || 'appartement') as BienType),
            unitKey
          ),
        };
        setImages((prev) => [...prev, newMedia]);
        successCount += 1;
      }
      if (successCount > 0) {
        toast.success(`${successCount} preuve(s) uploadee(s)`);
      } else {
        toast.error('Erreur upload');
      }
    } catch {
      toast.error('Erreur upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (name === 'reference') {
      setIsReferenceManuallyEdited(true);
      setFormData((prev) => ({ ...prev, reference: value }));
      return;
    }
    const optionalNumericFields = ['superficie_m2', 'etage', 'annee_construction', 'distance_plage_m', 'surface_local_m2', 'facade_m', 'hauteur_plafond_m', 'terrain_facade_m', 'terrain_surface_m2', 'terrain_distance_plage_m', 'terrain_prix_affiche_total', 'terrain_prix_affiche_par_m2', 'terrain_route_acces_largeur_m', 'lotissement_nb_terrains', 'lotissement_prix_total', 'lotissement_prix_m2_unique', 'immeuble_surface_terrain_m2', 'immeuble_surface_batie_m2', 'immeuble_nb_niveaux', 'immeuble_nb_garages', 'immeuble_nb_appartements', 'immeuble_nb_locaux_commerciaux', 'immeuble_distance_plage_m', 'prix_affiche_client', 'prix_fixe_proprietaire', 'prix_proprietaire', 'prix_semaine', 'commission_pourcentage_proprietaire', 'commission_pourcentage_client', 'montant_max_reduction_negociation', 'pourcentage_premiere_partie_promesse', 'nombre_tranches', 'periode_tranches_mois'];
    if (name === 'mode') {
      const nextMode = value as BienMode;
      const allowedTypes = BIEN_TYPES_BY_MODE[nextMode] || BIEN_TYPES_BY_MODE.location_saisonniere;
      setFormData((prev) => {
        const currentType = normalizeLegacyType(prev.type as BienType);
        const nextType = allowedTypes.includes(currentType) ? currentType : allowedTypes[0];
        const keepAppartementVenteDetails = nextMode === 'vente' && nextType === 'appartement';
        const keepLocalCommercialVenteDetails = nextMode === 'vente' && nextType === 'local_commercial';
        const keepTerrainVenteDetails = nextMode === 'vente' && nextType === 'terrain';
        const keepLotissementVenteDetails = nextMode === 'vente' && nextType === 'lotissement';
        const keepImmeubleVenteDetails = nextMode === 'vente' && nextType === 'immeuble';
        const next = {
          ...prev,
          mode: nextMode,
          type: nextType,
          type_rue: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails || keepLotissementVenteDetails) ? prev.type_rue || null : null,
          type_papier: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails || keepLotissementVenteDetails) ? prev.type_papier || null : null,
        };
        if (keepAppartementVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(next))));
        if (keepLocalCommercialVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetAppartementVenteFields(next))));
        if (keepTerrainVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        if (keepLotissementVenteDetails) return resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        if (keepImmeubleVenteDetails) return resetLotissementVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next)))));
      });
      return;
    }
    if (name === 'type') {
      const nextType = normalizeLegacyType(value as BienType);
      setFormData((prev) => {
        const keepAppartementVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'appartement';
        const keepLocalCommercialVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'local_commercial';
        const keepTerrainVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'terrain';
        const keepLotissementVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'lotissement';
        const keepImmeubleVenteDetails = (prev.mode || 'location_saisonniere') === 'vente' && nextType === 'immeuble';
        const next = {
          ...prev,
          type: nextType,
          type_rue: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails || keepLotissementVenteDetails) ? prev.type_rue || null : null,
          type_papier: (keepAppartementVenteDetails || keepLocalCommercialVenteDetails || keepTerrainVenteDetails || keepImmeubleVenteDetails || keepLotissementVenteDetails) ? prev.type_papier || null : null,
        };
        if (keepAppartementVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(next))));
        if (keepLocalCommercialVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetAppartementVenteFields(next))));
        if (keepTerrainVenteDetails) return resetLotissementVenteFields(resetImmeubleVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        if (keepLotissementVenteDetails) return resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        if (keepImmeubleVenteDetails) return resetLotissementVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next))));
        return resetLotissementVenteFields(resetImmeubleVenteFields(resetTerrainVenteFields(resetLocalCommercialVenteFields(resetAppartementVenteFields(next)))));
      });
      return;
    }
    if (optionalNumericFields.includes(name)) {
      setFormData(prev => ({ ...prev, [name]: value === '' ? null : Number(value) }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };
  const resetAppartementVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
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
  });
  const resetLocalCommercialVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
    surface_local_m2: null,
    facade_m: null,
    hauteur_plafond_m: null,
    activite_recommandee: null,
    toilette: false,
    reserve_local: false,
    vitrine: false,
    coin_angle: false,
    electricite_3_phases: false,
    gaz_ville: false,
    alarme: false,
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const resetTerrainVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
    type_terrain: null,
    terrain_facade_m: null,
    terrain_surface_m2: null,
    terrain_distance_plage_m: null,
    terrain_zone: null,
    terrain_constructible: false,
    terrain_angle: false,
    terrain_prix_affiche_total: null,
    terrain_prix_affiche_par_m2: null,
    terrain_mode_affichage_prix: null,
    terrain_disponibilite_reseaux: [],
    terrain_hauteur_construction_autorisee: null,
    terrain_route_acces_largeur_m: null,
    terrain_forme: null,
    terrain_topographie: null,
    terrain_bornage: false,
    terrain_travaux_municipalite_autorises: false,
    terrain_limites_cadastrales: false,
    terrain_visualisation_limites_cadastrales: false,
    terrain_voisinage: null,
    terrain_proximites_commodites: [],
    terrain_proximites_commodites_autres: null,
    terrain_viabilisation_eau_sources: [],
    terrain_viabilisation_onas: null,
    terrain_viabilisation_steg: null,
    terrain_viabilisation_gaz_ville: false,
    terrain_viabilisation_fibre_optique: false,
    terrain_viabilisation_telephone_fixe: false,
    terrain_type_sol: null,
    terrain_vegetation: null,
    terrain_niveau_sonore: null,
    terrain_risque_inondation: false,
    terrain_exposition_vent: null,
    terrain_ideal_utilisations: [],
    terrain_documents_disponibles: [],
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const resetLotissementVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    lotissement_nb_terrains: null,
    lotissement_prix_total: null,
    lotissement_mode_prix_m2: null,
    lotissement_prix_m2_unique: null,
    lotissement_terrains: [],
    lotissement_paliers_prix_m2: [],
  });
  const resetImmeubleVenteFields = (current: Partial<Bien>): Partial<Bien> => ({
    ...current,
    type_rue: null,
    type_papier: null,
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
    immeuble_garages: [],
    immeuble_locaux_commerciaux: [],
    eau_puits: false,
    eau_sonede: false,
    electricite_steg: false,
  });
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.checked }));
  const currentServiceIds = useMemo(
    () => new Set((saisonConfig.services_payants || []).map((service) => String(service?.id || '').trim()).filter(Boolean)),
    [saisonConfig.services_payants]
  );
  const availableServiceCatalogOptions = useMemo(
    () => serviceCatalogueOptions.filter((service) => !currentServiceIds.has(service.id)),
    [currentServiceIds, serviceCatalogueOptions]
  );
  const addServicePayant = () => {
    const nextServices = Array.isArray(saisonConfig.services_payants) ? [...saisonConfig.services_payants] : [];
    nextServices.push(normalizeServicePayant({
      id: `service_${Date.now()}`,
      categorie: 'Services client',
      label: '',
      description_courte: '',
      prix: 0,
      type_tarification: 'fixe',
      enabled: true,
    }));
    updateSaisonConfig({ services_payants: nextServices });
  };
  const addServicePayantFromCatalog = (serviceId: string) => {
    const normalizedId = String(serviceId || '').trim();
    if (!normalizedId) return;
    if (currentServiceIds.has(normalizedId)) {
      toast.info('Ce service payant est deja ajoute a ce bien.');
      return;
    }
    const selectedService = serviceCatalogueOptions.find((service) => service.id === normalizedId);
    if (!selectedService) {
      toast.error('Service introuvable dans le catalogue.');
      return;
    }
    const nextServices = Array.isArray(saisonConfig.services_payants) ? [...saisonConfig.services_payants] : [];
    nextServices.push(normalizeServicePayant(selectedService));
    updateSaisonConfig({ services_payants: nextServices });
    setSelectedServiceCatalogId('');
    toast.success('Service payant ajoute depuis le catalogue.');
  };
  const updateServicePayant = (index: number, patch: Partial<ServicePayantBien>) => {
    const nextServices = Array.isArray(saisonConfig.services_payants) ? [...saisonConfig.services_payants] : [];
    if (!nextServices[index]) return;
    nextServices[index] = normalizeServicePayant({ ...nextServices[index], ...patch });
    updateSaisonConfig({ services_payants: nextServices });
  };
  const removeServicePayant = (index: number) => {
    const nextServices = Array.isArray(saisonConfig.services_payants) ? [...saisonConfig.services_payants] : [];
    if (!nextServices[index]) return;
    nextServices.splice(index, 1);
    updateSaisonConfig({ services_payants: nextServices });
  };
  const updateCatalogueDraft = (serviceId: string, patch: Partial<ServicePayantBien>) => {
    const normalizedId = String(serviceId || '').trim();
    if (!normalizedId) return;
    setServiceCatalogueDrafts((prev) => ({
      ...prev,
      [normalizedId]: normalizeServicePayant({ ...(prev[normalizedId] || {}), id: normalizedId, ...patch }),
    }));
  };
  const handleCreateCatalogueService = async () => {
    const normalized = normalizeServicePayant(newCatalogueService);
    if (!String(normalized.label || '').trim()) {
      toast.error('Libelle service requis');
      return;
    }
    const payload = {
      ...normalized,
      id: String(normalized.id || '').trim() || `svc_${Date.now()}`,
    };
    setCatalogueActionId(payload.id);
    try {
      const response = await fetch(`${API_URL}/services-payants/catalogue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('creation');
      await refreshServiceCatalogue({ fallbackOnError: false });
      setNewCatalogueService(normalizeServicePayant({
        id: '',
        categorie: payload.categorie || 'Services client',
        label: '',
        description_courte: '',
        prix: 0,
        prix_affiche: '',
        type_tarification: 'fixe',
        enabled: true,
      }));
      toast.success('Service catalogue ajoute');
    } catch {
      toast.error("Erreur creation service catalogue");
    } finally {
      setCatalogueActionId(null);
    }
  };
  const handleSaveCatalogueService = async (serviceId: string) => {
    const normalizedId = String(serviceId || '').trim();
    const draft = serviceCatalogueDrafts[normalizedId];
    if (!normalizedId || !draft) return;
    const normalized = normalizeServicePayant({ ...draft, id: normalizedId });
    if (!String(normalized.label || '').trim()) {
      toast.error('Libelle service requis');
      return;
    }
    setCatalogueActionId(normalizedId);
    try {
      const response = await fetch(`${API_URL}/services-payants/catalogue/${encodeURIComponent(normalizedId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
      });
      if (!response.ok) throw new Error('update');
      await refreshServiceCatalogue({ fallbackOnError: false });
      toast.success('Service catalogue mis a jour');
    } catch {
      toast.error('Erreur mise a jour service catalogue');
    } finally {
      setCatalogueActionId(null);
    }
  };
  const handleDeleteCatalogueService = async (serviceId: string) => {
    const normalizedId = String(serviceId || '').trim();
    if (!normalizedId) return;
    if (!window.confirm('Supprimer ce service du catalogue ?')) return;
    setCatalogueActionId(normalizedId);
    try {
      const response = await fetch(`${API_URL}/services-payants/catalogue/${encodeURIComponent(normalizedId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('delete');
      await refreshServiceCatalogue({ fallbackOnError: false });
      const currentServices = Array.isArray(saisonConfig.services_payants) ? saisonConfig.services_payants : [];
      const filteredServices = currentServices.filter((item) => String(item?.id || '').trim() !== normalizedId);
      if (filteredServices.length !== currentServices.length) {
        updateSaisonConfig({ services_payants: filteredServices });
      }
      if (selectedServiceCatalogId === normalizedId) {
        setSelectedServiceCatalogId('');
      }
      toast.success('Service catalogue supprime');
    } catch {
      toast.error('Erreur suppression service catalogue');
    } finally {
      setCatalogueActionId(null);
    }
  };
  const updateUiConfig = (patch: Partial<BienUiConfig>) =>
    setFormData((prev) => ({ ...prev, ui_config: { ...(prev.ui_config || {}), ...patch } }));
  const setUiSectionVisible = (key: keyof BienUiConfig, checked: boolean) =>
    updateUiConfig({ [key]: checked } as Partial<BienUiConfig>);
  const getFeatureTabApiBases = () => Array.from(new Set([
    `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique-onglets`,
    `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique-onglets`,
  ]));
  const setTerrainTabVisible = (tabId: string, checked: boolean) =>
    setFormData((prev) => ({
      ...prev,
      ui_config: {
        ...(prev.ui_config || {}),
        terrain_tabs: {
          ...((prev.ui_config && prev.ui_config.terrain_tabs) || {}),
          [tabId]: checked,
        },
      },
    }));
  type TerrainMultiField =
    | 'terrain_disponibilite_reseaux'
    | 'terrain_proximites_commodites'
    | 'terrain_viabilisation_eau_sources'
    | 'terrain_ideal_utilisations'
    | 'terrain_documents_disponibles';
  const handleMultiSelectChange = (field: keyof Bien, values: string[]) => {
    setFormData((prev) => ({ ...prev, [field]: values }));
  };
  const handleTerrainMultiToggle = (field: TerrainMultiField, value: string, checked: boolean) => {
    const currentValues = Array.isArray(formData[field]) ? (formData[field] as string[]) : [];
    const nextValues = checked
      ? Array.from(new Set([...currentValues, value]))
      : currentValues.filter((item) => item !== value);
    handleMultiSelectChange(field, nextValues);
  };
  const renderTerrainMultiChoice = (
    field: TerrainMultiField,
    label: string,
    options: readonly { value: string; label: string }[],
    helperText?: string
  ) => {
    const selectedValues = Array.isArray(formData[field]) ? (formData[field] as string[]) : [];
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="rounded-lg border border-gray-300 p-2 bg-white">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedValues.length > 0 ? selectedValues.map((selectedValue) => {
              const optionLabel = options.find((option) => option.value === selectedValue)?.label || selectedValue;
              return (
                <button
                  key={selectedValue}
                  type="button"
                  onClick={() => handleTerrainMultiToggle(field, selectedValue, false)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-emerald-200 text-emerald-700 bg-emerald-50"
                  title="Retirer"
                >
                  <span>{optionLabel}</span>
                  <span aria-hidden="true">x</span>
                </button>
              );
            }) : <span className="text-xs text-gray-500">Aucune selection</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {options.map((option) => (
              <label key={option.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option.value)}
                  onChange={(e) => handleTerrainMultiToggle(field, option.value, e.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
        {helperText && <p className="text-xs text-gray-500 mt-1">{helperText}</p>}
      </div>
    );
  };
  const handleBooleanSelectChange = (field: keyof Bien, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value === 'oui' }));
  };
  const getBooleanSelectValue = (value?: boolean) => (value ? 'oui' : 'non');
  const handleImmeubleAppartementChange = (index: number, field: 'chambres' | 'salle_bain' | 'superficie_m2' | 'configuration', value: string) => {
    const rows = Array.isArray(formData.immeuble_appartements) ? [...formData.immeuble_appartements] : [];
    const current = rows[index] || { index: index + 1, reference: generateChildReference('APT', index + 1), chambres: 0, salle_bain: 0, superficie_m2: null, configuration: null };
    if (field === 'configuration') {
      rows[index] = { ...current, configuration: value || null };
    } else if (field === 'superficie_m2') {
      rows[index] = { ...current, superficie_m2: value === '' ? null : Number(value) };
    } else {
      rows[index] = { ...current, [field]: Math.max(0, Number(value || 0)) } as any;
    }
    setFormData((prev) => ({ ...prev, immeuble_appartements: rows }));
  };
  const handleLotissementTerrainChange = (index: number, field: string, value: string | boolean) => {
    const rows = Array.isArray(formData.lotissement_terrains) ? [...formData.lotissement_terrains] : [];
    const current = rows[index] || { index: index + 1, reference: generateChildReference('TRN', index + 1) };
    const numericFields = ['surface_m2', 'terrain_distance_plage_m'];
    const nextValue = numericFields.includes(field as string)
      ? (value === '' ? null : Number(value))
      : value;
    rows[index] = { ...current, [field]: nextValue };
    setFormData((prev) => ({ ...prev, lotissement_terrains: rows }));
  };
  const handleLotissementPalierChange = (index: number, field: 'min_m2' | 'max_m2' | 'prix_m2', value: string) => {
    const rows = Array.isArray(formData.lotissement_paliers_prix_m2) ? [...formData.lotissement_paliers_prix_m2] : [];
    const current = rows[index] || { min_m2: 0, max_m2: null, prix_m2: 0 };
    rows[index] = { ...current, [field]: value === '' ? null : Number(value) } as any;
    setFormData((prev) => ({ ...prev, lotissement_paliers_prix_m2: rows }));
  };
  const addLotissementPalier = () => {
    setFormData((prev) => ({
      ...prev,
      lotissement_paliers_prix_m2: [...(prev.lotissement_paliers_prix_m2 || []), { min_m2: 0, max_m2: null, prix_m2: 0 }],
    }));
  };
  const removeLotissementPalier = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      lotissement_paliers_prix_m2: (prev.lotissement_paliers_prix_m2 || []).filter((_, idx) => idx !== index),
    }));
  };

  const handleAddImage = (motifOverride?: string | null) => {
    if (!newImageUrl.trim()) return;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const isLocalCommercial = selectedType === 'local_commercial';
    const resolvedMotif = motifOverride ?? (isLocalCommercial ? newImageMotif.trim() : null);
    if (isLocalCommercial && !resolvedMotif) {
      return toast.error("Motif d'upload requis pour le local");
    }
    const newMedia: Media = {
      id: Math.random().toString(36).substr(2, 9),
      bien_id: formData.id || '',
      type: 'image',
      url: newImageUrl,
      motif_upload: resolvedMotif,
    };
    setImages([...images, newMedia]);
    setNewImageUrl('');
    if (isLocalCommercial && !motifOverride) setNewImageMotif('');
    toast.success('Image ajoutÃ©e');
  };

  const handleAddVideo = () => {
    if (!newVideoUrl.trim()) return;
    if (!isSupportedVideoUrl(newVideoUrl)) {
      toast.error('Ajoutez un lien video YouTube ou Facebook valide');
      return;
    }
    const newMedia: Media = {
      id: Math.random().toString(36).substr(2, 9),
      bien_id: formData.id || '',
      type: 'video',
      url: newVideoUrl.trim(),
      motif_upload: null,
    };
    setImages([...images, newMedia]);
    setNewVideoUrl('');
    toast.success('VidÃ©o ajoutÃ©e');
  };

  const handleRemoveImage = (id: string) => {
    const mediaId = String(id || '').trim();
    if (!mediaId) return;
    const existsInInitialMedia = (initialData?.media || []).some((item) => String(item?.id || '').trim() === mediaId);
    setImages((prev) => prev.filter((img) => String(img.id || '').trim() !== mediaId));
    if (existsInInitialMedia) {
      setDeletedMediaIds((prev) => (prev.includes(mediaId) ? prev : [...prev, mediaId]));
    }
    toast.success('MÃ©dia supprimÃ©');
  };

  const reorderClientImages = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const clientImages = images.filter((img) => img.type === 'image' && !isProofImage(img));
    const fromIndex = clientImages.findIndex((img) => img.id === fromId);
    const toIndex = clientImages.findIndex((img) => img.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextClientImages = [...clientImages];
    const [movedImage] = nextClientImages.splice(fromIndex, 1);
    nextClientImages.splice(toIndex, 0, movedImage);
    let clientCursor = 0;
    setImages(images.map((img) => (isProofImage(img) || img.type === 'video' ? img : nextClientImages[clientCursor++])));
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, imageId: string) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    setDraggedImageIndex(imageId);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const handleDrop = (targetId: string) => {
    if (draggedImageIndex === null) return;
    reorderClientImages(draggedImageIndex, targetId);
    setDraggedImageIndex(null);
  };
  const handleDragEnd = () => setDraggedImageIndex(null);

  const handleMoveImage = (imageId: string, direction: 'up' | 'down') => {
    const index = clientVisibleImages.findIndex((img) => img.id === imageId);
    if (index < 0) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= clientVisibleImages.length) return;
    reorderClientImages(imageId, clientVisibleImages[newIndex].id);
  };

  const handleSetMainImage = (index: number) => {
    if (index === 0) return;
    const newImages = [...clientVisibleImages];
    const [movedImage] = newImages.splice(index, 1);
    newImages.unshift(movedImage);
    let clientCursor = 0;
    setImages(images.map((img) => (isProofImage(img) || img.type === 'video' ? img : newImages[clientCursor++])));
    toast.success('Image principale dÃ©finie');
  };


  const renderTypeProofUploads = () => (
    <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-white p-3 sm:p-4">
      <h5 className="text-sm font-semibold text-gray-800">Preuves (optionnel)</h5>
      <p className="text-xs text-gray-500 mt-1">Vous pouvez ajouter des images de preuve pour le type de rue et le type de papier de ce bien.</p>
      <p className="text-xs text-gray-500 mt-1">Contexte: {(formData.mode || 'location_saisonniere')} / {normalizeLegacyType((formData.type || 'appartement') as BienType)}</p>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Upload className="h-4 w-4 text-emerald-600" />
            <span>Preuve type de rue</span>
          </label>
          <input
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_RUE, e)}
            disabled={uploading}
            className="block w-full text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            {typeRueProofImages.map((img) => (
              <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                    <SmartImage src={resolveMediaUrl(img.url)} alt="Preuve type de rue" className="w-full h-20 object-cover" loading="lazy" decoding="async" fetchPriority="low" targetWidth={240} quality={52} />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(img.id)}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full"
                  aria-label="Supprimer preuve type de rue"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {typeRueProofImages.length === 0 && <span className="text-xs text-gray-500 col-span-full">Aucune preuve type de rue</span>}
          </div>
	                </div>
	                <div className="space-y-2">
	                  <label className="block text-sm font-medium text-gray-700 mb-1">Lien Maps du bien (iframe/URL)</label>
	                  <input
	                    type="text"
	                    value={String(saisonConfig.google_maps_embed_url || '')}
	                    onChange={(e) => updateSaisonConfig({ google_maps_embed_url: normalizeMapsInput(e.target.value) })}
	                    placeholder="https://www.google.com/maps/embed?pb=... (prioritaire sur la zone)"
	                    className="block w-full rounded-lg border-gray-300 border p-2"
	                  />
	                  <p className="text-xs text-gray-500">Ce lien est separÃ© de la zone et sera utilise en priorite sur la page client.</p>
	                </div>
	                <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Upload className="h-4 w-4 text-emerald-600" />
            <span>Preuve type de papier</span>
          </label>
          <input
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_PAPIER, e)}
            disabled={uploading}
            className="block w-full text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            {typePapierProofImages.map((img) => (
              <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                    <SmartImage src={resolveMediaUrl(img.url)} alt="Preuve type de papier" className="w-full h-20 object-cover" loading="lazy" decoding="async" fetchPriority="low" targetWidth={240} quality={52} />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(img.id)}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full"
                  aria-label="Supprimer preuve type de papier"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {typePapierProofImages.length === 0 && <span className="text-xs text-gray-500 col-span-full">Aucune preuve type de papier</span>}
          </div>
        </div>
      </div>
      {uploading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600 mt-3"></div>}
    </div>
  );

  const getFeatureApiBases = () => Array.from(new Set([
    `${String(API_URL || '').replace(/\/+$/, '')}/caracteristiques`,
    `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique`,
    `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristiques`,
    `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique`,
  ]));
  const syncSaisonniereTemplateFromAppartement = async (mode: BienMode, type: BienType) => {
    if (mode !== 'location_saisonniere' || type === 'appartement') return;
    const sourceType: BienType = 'appartement';
    const tabApiBases = getFeatureTabApiBases();
    const featureApiBases = getFeatureApiBases();
    const fetchFromBases = async (
      bases: string[],
      buildUrl: (base: string) => string,
      init?: RequestInit
    ) => {
      let lastResponse: Response | null = null;
      for (const base of bases) {
        const response = await fetch(buildUrl(base), init);
        lastResponse = response;
        if (response.ok) return response;
        if (response.status !== 404) return response;
      }
      return lastResponse;
    };

    const sourceTabsResponse = await fetchFromBases(
      tabApiBases,
      (base) => `${base}?mode_bien=${mode}&type_bien=${sourceType}`
    );
    if (!sourceTabsResponse?.ok) return;
    const sourceTabs = (await sourceTabsResponse.json()) as CaracteristiqueOnglet[];
    if (!Array.isArray(sourceTabs) || sourceTabs.length === 0) return;

    const targetTabsResponse = await fetchFromBases(
      tabApiBases,
      (base) => `${base}?mode_bien=${mode}&type_bien=${type}`
    );
    const targetTabsInitial = targetTabsResponse?.ok ? ((await targetTabsResponse.json()) as CaracteristiqueOnglet[]) : [];
    let targetTabs = Array.isArray(targetTabsInitial) ? [...targetTabsInitial] : [];

    for (const sourceTab of sourceTabs) {
      const sourceName = normalizeTabNameForMatch(String(sourceTab.nom || ''));
      if (!sourceName) continue;
      const exists = targetTabs.some((tab) => normalizeTabNameForMatch(String(tab.nom || '')) === sourceName);
      if (exists) continue;

      const createPayload = {
        mode_bien: mode,
        type_bien: type,
        nom: String(sourceTab.nom || '').trim(),
        ordre: Number(sourceTab.ordre || 999),
        is_system: Number(sourceTab.is_system || 0) === 1 ? 1 : 0,
      };
      const createdResponse = await fetchFromBases(
        tabApiBases,
        (base) => base,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        }
      );
      if (createdResponse?.ok) {
        const createdTab = await createdResponse.json();
        if (createdTab?.id) targetTabs.push(createdTab as CaracteristiqueOnglet);
      }
    }

    const sourceFeaturesResponse = await fetchFromBases(
      featureApiBases,
      (base) => `${base}?mode_bien=${mode}&type_bien=${sourceType}`
    );
    if (!sourceFeaturesResponse?.ok) return;
    const sourceFeatures = (await sourceFeaturesResponse.json()) as Caracteristique[];
    if (!Array.isArray(sourceFeatures) || sourceFeatures.length === 0) return;

    const targetFeaturesResponse = await fetchFromBases(
      featureApiBases,
      (base) => `${base}?mode_bien=${mode}&type_bien=${type}`
    );
    const targetFeatures = targetFeaturesResponse?.ok ? ((await targetFeaturesResponse.json()) as Caracteristique[]) : [];
    const existingFeatureNames = new Set(
      (Array.isArray(targetFeatures) ? targetFeatures : []).map((feature) => normalizeFeatureName(String(feature.nom || '')))
    );

    const sourceTabsById = new Map(sourceTabs.map((tab) => [String(tab.id || ''), tab]));
    for (const sourceFeature of sourceFeatures) {
      const normalizedName = normalizeFeatureName(String(sourceFeature.nom || ''));
      if (!normalizedName || existingFeatureNames.has(normalizedName)) continue;

      const sourceTabName = normalizeTabNameForMatch(
        String(
          sourceFeature.onglet_nom
          || sourceTabsById.get(String(sourceFeature.onglet_id || ''))?.nom
          || ''
        )
      );
      const mappedTargetTab = targetTabs.find((tab) => normalizeTabNameForMatch(String(tab.nom || '')) === sourceTabName);
      const payload = {
        nom: String(sourceFeature.nom || '').trim(),
        mode_bien: mode,
        type_bien: type,
        type_caracteristique: normalizeFeatureType(sourceFeature.type_caracteristique),
        choix: parseFeatureChoices(stringifyFeatureChoices(sourceFeature.choix_json)),
        unite: String(sourceFeature.unite || '').trim() || null,
        icon_name: String(sourceFeature.icon_name || '').trim() || null,
        onglet_id: mappedTargetTab?.id || null,
        visibilite_client: Number(sourceFeature.visibilite_client) === 0 ? 0 : 1,
      };

      const createdFeatureResponse = await fetchFromBases(
        featureApiBases,
        (base) => base,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (createdFeatureResponse?.ok) {
        existingFeatureNames.add(normalizedName);
      }
    }
  };

  const loadFeatureTabs = async (mode: BienMode, type: BienType) => {
    const tabApiBases = getFeatureTabApiBases();
    let lastResponse: Response | null = null;
    for (const base of tabApiBases) {
      const response = await fetch(`${base}?mode_bien=${mode}&type_bien=${type}`);
      lastResponse = response;
      if (response.ok) {
        const rows = await response.json();
        const nextTabs = Array.isArray(rows) ? rows : [];
        setFeatureTabs(nextTabs);
        setFeatureTabDrafts((prev) => {
          const nextDrafts: Record<string, string> = {};
          for (const tab of nextTabs) nextDrafts[tab.id] = prev[tab.id] ?? String(tab.nom || '');
          return nextDrafts;
        });
        if (nextTabs.length > 0) {
          const hasCurrent = nextTabs.some((tab: CaracteristiqueOnglet) => tab.id === selectedFeatureTabId);
          if (!hasCurrent) setSelectedFeatureTabId(nextTabs[0].id);
        } else {
          setSelectedFeatureTabId('');
        }
        return nextTabs as CaracteristiqueOnglet[];
      }
      if (response.status !== 404) break;
    }
    if (lastResponse && !lastResponse.ok) {
      setFeatureTabs([]);
      setSelectedFeatureTabId('');
    }
    return [] as CaracteristiqueOnglet[];
  };

  const loadAvailableFeatures = async (mode: BienMode, type: BienType) => {
    const featureApiBases = getFeatureApiBases();
    const fetchFromFeatureApi = async (
      buildUrl: (base: string) => string,
      init?: RequestInit
    ) => {
      let lastResponse: Response | null = null;
      for (const base of featureApiBases) {
        const response = await fetch(buildUrl(base), init);
        lastResponse = response;
        if (response.ok) return response;
        if (response.status !== 404) return response;
      }
      return lastResponse;
    };
    try {
      const bienIdQuery = initialData?.id ? `&bien_id=${encodeURIComponent(initialData.id)}` : '';
      const response = await fetchFromFeatureApi(
        (base) => `${base}?mode_bien=${mode}&type_bien=${type}${bienIdQuery}`
      );
      if (!response || !response.ok) throw new Error('Failed to fetch features');
      const rows = await response.json();
      const nextFeaturesRaw = Array.isArray(rows) ? rows : [];
      const seenNames = new Set<string>();
      const dedupedFeatures = nextFeaturesRaw.filter((f: Caracteristique) => {
        const normalizedName = normalizeFeatureName(f.nom || '');
        if (isLegacyNightLimitFeature(normalizedName)) return false;
        if (seenNames.has(normalizedName)) return false;
        seenNames.add(normalizedName);
        return true;
      });
      const nextFeatures = dedupedFeatures;
      setAvailableFeatures(nextFeatures);
      const nextFeatureIds = new Set(nextFeatures.map((f: Caracteristique) => f.id));
      setSelectedFeatureIds((prev) => prev.filter((id) => nextFeatureIds.has(id)));
      const nextChoiceValuesById: Record<string, string[]> = {};
      const nextValueById: Record<string, string> = {};
      for (const feature of nextFeatures) {
        const featureId = String(feature.id || '');
        const featureType = normalizeFeatureType(feature.type_caracteristique);
        const rawStored = String(feature.valeur_json || '').trim();
        if (!featureId || !rawStored) continue;
        try {
          const parsed = JSON.parse(rawStored);
          if ((featureType === 'choix_multiple' || featureType === 'plusieurs_choix') && Array.isArray(parsed)) {
            const nextValues = parsed.map((item) => String(item || '').trim()).filter(Boolean);
            if (nextValues.length > 0) nextChoiceValuesById[featureId] = featureType === 'choix_multiple' ? [nextValues[0]] : Array.from(new Set(nextValues));
            continue;
          }
          if ((featureType === 'valeur' || featureType === 'texte') && typeof parsed === 'string') {
            const nextValue = String(parsed || '').trim();
            if (nextValue) nextValueById[featureId] = nextValue;
          }
        } catch {
          // ignore malformed stored value
        }
      }
      if (Object.keys(nextChoiceValuesById).length > 0) {
        setFeatureChoiceValuesById((prev) => ({ ...prev, ...nextChoiceValuesById }));
      }
      if (Object.keys(nextValueById).length > 0) {
        setFeatureValueById((prev) => ({ ...prev, ...nextValueById }));
      }
      setFeatureDrafts((prev) => {
        const nextDrafts: Record<string, { nom: string; type_caracteristique: 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte'; choix: string; unite: string; icon_name: string; onglet_id: string; visibilite_client: 0 | 1 }> = {};
        for (const feature of nextFeatures) {
          nextDrafts[feature.id] = {
            nom: feature.nom || '',
            type_caracteristique: normalizeFeatureType(feature.type_caracteristique),
            choix: stringifyFeatureChoices(feature.choix_json),
            unite: feature.unite || '',
            icon_name: feature.icon_name || '',
            onglet_id: feature.onglet_id || '',
            visibilite_client: Number(feature.visibilite_client) === 0 ? 0 : 1,
          };
        }
        return { ...prev, ...nextDrafts };
      });
      return nextFeatures;
    } catch {
      setAvailableFeatures([]);
      return [];
    }
  };

  const createFeatureWithContext = async (payload: PendingFeatureAddition, options?: { skipExistingCheck?: boolean }) => {
    const featureApiBases = getFeatureApiBases();
    const fetchFromFeatureApi = async (
      buildUrl: (base: string) => string,
      init?: RequestInit
    ) => {
      let lastResponse: Response | null = null;
      for (const base of featureApiBases) {
        const response = await fetch(buildUrl(base), init);
        lastResponse = response;
        if (response.ok) return response;
        if (response.status !== 404) return response;
      }
      return lastResponse;
    };
    if (!options?.skipExistingCheck) {
      try {
        const existingResponse = await fetchFromFeatureApi((base) => base);
        if (existingResponse?.ok) {
          const existingRows = await existingResponse.json();
          const existingFeature = Array.isArray(existingRows)
            ? existingRows.find((feature: Caracteristique) => normalizeFeatureName(feature.nom || '') === normalizeFeatureName(payload.nom))
            : null;
          if (existingFeature) {
            setFeatureExistsDialog({
              open: true,
              featureName: payload.nom,
              mode: payload.mode_bien,
              type: payload.type_bien,
              canAddToCurrentContext: true,
              payload,
            });
            toast.error('Caracteristique existante. Confirmez son ajout pour ce mode/type dans la fenetre.');
            return;
          }
        }
      } catch {
        // If this lookup fails, keep the old flow and try creating directly.
      }
    }

    setFeatureSaving(true);
    try {
      const response = await fetchFromFeatureApi((base) => base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response || !response.ok) {
        const payloadError = response && response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
        throw new Error(payloadError?.error || 'Failed to create feature');
      }
      const createdFeature = await response.json();
      await loadAvailableFeatures(payload.mode_bien, payload.type_bien);
      if (createdFeature?.id) {
        setSelectedFeatureIds((prev) => (prev.includes(createdFeature.id) ? prev : [...prev, createdFeature.id]));
      }
      setNewFeature('');
      setNewFeatureType('simple');
      setNewFeatureChoices('');
      setNewFeatureUnit('');
      setNewFeatureIconName('');
      setOpenFeatureIconPickerId('new');
      setNewFeatureVisibilite(1);
      setFeatureExistsDialog({
        open: false,
        featureName: '',
        mode: payload.mode_bien,
        type: payload.type_bien,
        canAddToCurrentContext: false,
        payload: null,
      });
      toast.success('Caracteristique ajoutee');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur ajout caracteristique';
      toast.error(message);
    } finally {
      setFeatureSaving(false);
    }
  };

  const handleAddFeature = async () => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const value = newFeature.trim();
    const parsedChoices = parseFeatureChoices(newFeatureChoices);
    const parsedUnit = newFeatureUnit.trim();
    if (!value) return toast.error('Nom de caracteristique requis');
    const normalizedValue = normalizeFeatureName(value);
    if (isManagedDetailFeatureForContext(normalizedValue, selectedMode, selectedType)) {
      return toast.error('Cette caracteristique est geree automatiquement dans les details de ce mode/type');
    }
    if (availableFeatures.some((feature) => normalizeFeatureName(feature.nom || '') === normalizedValue)) {
      setFeatureExistsDialog({
        open: true,
        featureName: value,
        mode: selectedMode,
        type: selectedType,
        canAddToCurrentContext: false,
        payload: null,
      });
      toast.error('Caracteristique deja existante pour ce mode/type');
      return;
    }
    if (newFeatureType === 'valeur' && !parsedUnit) {
      return toast.error('Unite requise pour type valeur');
    }
    if ((newFeatureType === 'choix_multiple' || newFeatureType === 'plusieurs_choix') && parsedChoices.length === 0) {
      return toast.error('Ajoutez au moins un choix');
    }
    const payload: PendingFeatureAddition = {
      nom: value,
      mode_bien: selectedMode,
      type_bien: selectedType,
      type_caracteristique: newFeatureType,
      choix: (newFeatureType === 'choix_multiple' || newFeatureType === 'plusieurs_choix') ? parsedChoices : [],
      unite: newFeatureType === 'valeur' ? parsedUnit : null,
      icon_name: newFeatureIconName || null,
      onglet_id: selectedFeatureTabId || null,
      visibilite_client: newFeatureVisibilite,
    };
    await createFeatureWithContext(payload);
  };

  const handleRemoveFeature = async (feature: Caracteristique) => {
    const featureApiBases = Array.from(new Set([
      `${String(API_URL || '').replace(/\/+$/, '')}/caracteristiques`,
      `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique`,
      `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristiques`,
      `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique`,
    ]));
    const fetchFromFeatureApi = async (
      buildUrl: (base: string) => string,
      init?: RequestInit
    ) => {
      let lastResponse: Response | null = null;
      for (const base of featureApiBases) {
        const response = await fetch(buildUrl(base), init);
        lastResponse = response;
        if (response.ok) return response;
        if (response.status !== 404) return response;
      }
      return lastResponse;
    };
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    setFeatureSaving(true);
    try {
      const response = await fetchFromFeatureApi(
        (base) => `${base}/${encodeURIComponent(feature.id)}?mode_bien=${selectedMode}&type_bien=${selectedType}`,
        { method: 'DELETE' }
      );
      if (!response || !response.ok) {
        const responseStatus = response?.status ?? 0;
        const responseText = response ? await response.text().catch(() => '') : '';
        if (responseStatus === 404 && responseText.includes('Cannot DELETE')) {
          toast.error("Suppression indisponible sur ce backend. Redemarrer l'API serveur.");
          return;
        }
        throw new Error(`Failed to delete feature: ${responseStatus}`);
      }
      setSelectedFeatureIds((prev) => prev.filter((id) => id !== feature.id));
      await loadAvailableFeatures(selectedMode, selectedType);
      toast.success('Caracteristique supprimee');
    } catch {
      toast.error('Erreur suppression caracteristique (verifier API/restart backend)');
    } finally {
      setFeatureSaving(false);
    }
  };

  const handleCreateFeatureTab = async () => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const tabName = newFeatureTabName.trim();
    if (!tabName) return toast.error("Nom d'onglet requis");
    setFeatureSaving(true);
    try {
      const tabApiBases = Array.from(new Set([
        `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique-onglets`,
        `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique-onglets`,
      ]));
      let response: Response | null = null;
      for (const base of tabApiBases) {
        const next = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode_bien: selectedMode,
            type_bien: selectedType,
            nom: tabName,
          }),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) throw new Error('Failed to create tab');
      const created = await response.json();
      await loadFeatureTabs(selectedMode, selectedType);
      if (created?.id) setSelectedFeatureTabId(created.id);
      setNewFeatureTabName('');
      toast.success('Onglet ajoute');
    } catch {
      toast.error("Erreur ajout onglet");
    } finally {
      setFeatureSaving(false);
    }
  };

  const handleDeleteFeatureTab = async (tab: CaracteristiqueOnglet) => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    setFeatureSaving(true);
    try {
      const tabApiBases = Array.from(new Set([
        `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique-onglets`,
        `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique-onglets`,
      ]));
      let response: Response | null = null;
      for (const base of tabApiBases) {
        const next = await fetch(`${base}/${encodeURIComponent(tab.id)}`, { method: 'DELETE' });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) throw new Error('Failed to delete tab');
      await loadFeatureTabs(selectedMode, selectedType);
      await loadAvailableFeatures(selectedMode, selectedType);
      toast.success('Onglet supprime');
    } catch {
      toast.error("Erreur suppression onglet");
    } finally {
      setFeatureSaving(false);
    }
  };

  const handleUpdateFeatureTab = async (tab: CaracteristiqueOnglet) => {
    const nextName = String(featureTabDrafts[tab.id] || '').trim();
    if (!nextName) return toast.error("Nom d'onglet requis");
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    setSelectedFeatureTabId(tab.id);
    setFeatureSaving(true);
    try {
      const tabApiBases = Array.from(new Set([
        `${String(API_URL || '').replace(/\/+$/, '')}/caracteristique-onglets`,
        `${String(API_URL || '').replace(/\/api$/i, '').replace(/\/+$/, '')}/api/caracteristique-onglets`,
      ]));
      let response: Response | null = null;
      for (const base of tabApiBases) {
        const next = await fetch(`${base}/${encodeURIComponent(tab.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom: nextName, ordre: tab.ordre || 999 }),
        });
        response = next;
        if (next.ok) break;
        if (next.status === 404) {
          const fallback = await fetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: tab.id,
              mode_bien: selectedMode,
              type_bien: selectedType,
              nom: nextName,
              ordre: tab.ordre || 999,
            }),
          });
          response = fallback;
          if (fallback.ok || fallback.status !== 404) break;
        } else {
          break;
        }
      }
      if (!response || !response.ok) throw new Error('Failed to update tab');
      await loadFeatureTabs(selectedMode, selectedType);
      await loadAvailableFeatures(selectedMode, selectedType);
      setSelectedFeatureTabId(tab.id);
      toast.success('Onglet modifie');
    } catch {
      toast.error("Erreur modification onglet");
    } finally {
      setFeatureSaving(false);
    }
  };

  const handleFeatureDraftChange = (featureId: string, patch: Partial<{ nom: string; type_caracteristique: 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte'; choix: string; unite: string; icon_name: string; onglet_id: string; visibilite_client: 0 | 1 }>) => {
    setFeatureDrafts((prev) => ({
      ...prev,
      [featureId]: {
        nom: prev[featureId]?.nom || '',
        type_caracteristique: prev[featureId]?.type_caracteristique || 'simple',
        choix: prev[featureId]?.choix || '',
        unite: prev[featureId]?.unite || '',
        icon_name: prev[featureId]?.icon_name || '',
        onglet_id: prev[featureId]?.onglet_id || '',
        visibilite_client: prev[featureId]?.visibilite_client ?? 1,
        ...patch,
      },
    }));
  };

  const handleUpdateFeature = async (feature: Caracteristique) => {
    return handleUpdateFeatureWithScope(feature, false);
  };

  const handleUpdateFeatureWithScope = async (feature: Caracteristique, applyToAll: boolean) => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const draft = featureDrafts[feature.id];
    if (!draft) return;
    const normalizedName = String(draft.nom || '').trim();
    const normalizedChoices = parseFeatureChoices(draft.choix);
    const normalizedUnit = String(draft.unite || '').trim();
    if (!normalizedName) return toast.error('Nom requis');
    if (draft.type_caracteristique === 'valeur' && !normalizedUnit) {
      return toast.error('Unite requise');
    }
    if ((draft.type_caracteristique === 'choix_multiple' || draft.type_caracteristique === 'plusieurs_choix') && normalizedChoices.length === 0) {
      return toast.error('Ajoutez au moins un choix');
    }
    setFeatureSaving(true);
    try {
      const featureApiBases = getFeatureApiBases();
      let response: Response | null = null;
      for (const base of featureApiBases) {
        const next = await fetch(`${base}/${encodeURIComponent(feature.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode_bien: selectedMode,
            type_bien: selectedType,
            bien_id: initialData?.id || null,
            apply_to_all: applyToAll,
            nom: normalizedName,
            type_caracteristique: draft.type_caracteristique,
            choix: (draft.type_caracteristique === 'choix_multiple' || draft.type_caracteristique === 'plusieurs_choix') ? normalizedChoices : [],
            unite: draft.type_caracteristique === 'valeur' ? normalizedUnit : null,
            icon_name: draft.icon_name || null,
            onglet_id: draft.onglet_id || null,
            visibilite_client: draft.visibilite_client,
          }),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) throw new Error('Failed to update feature');
      const nextFeatures = await loadAvailableFeatures(selectedMode, selectedType);
      const updatedFeature = Array.isArray(nextFeatures) ? nextFeatures.find((item) => item.id === feature.id) : null;
      if (updatedFeature && (Number(updatedFeature.visibilite_client) === 0 ? 0 : 1) !== draft.visibilite_client) {
        throw new Error('Feature visibility mismatch after reload');
      }
      toast.success(applyToAll ? 'Caracteristique appliquee a tous les biens' : 'Caracteristique mise a jour');
    } catch {
      toast.error("Modification non persistÃ©e. VÃ©rifier que l'API/backend dÃ©ployÃ© contient bien la logique d'override par bien.");
    } finally {
      setFeatureSaving(false);
    }
  };

  const savePendingFeatureDrafts = async (mode: BienMode, type: BienType) => {
    const featureApiBases = getFeatureApiBases();
    for (const feature of availableFeatures) {
      const draft = featureDrafts[feature.id];
      if (!draft) continue;
      const currentType = normalizeFeatureType(feature.type_caracteristique);
      const currentChoices = stringifyFeatureChoices(feature.choix_json);
      const currentUnit = String(feature.unite || '').trim();
      const currentIconName = String(feature.icon_name || '').trim();
      const currentTab = String(feature.onglet_id || '').trim();
      const currentVisibility = Number(feature.visibilite_client) === 0 ? 0 : 1;
      const nextName = String(draft.nom || '').trim();
      const nextType = draft.type_caracteristique;
      const nextChoices = parseFeatureChoices(draft.choix);
      const nextUnit = String(draft.unite || '').trim();
      const nextIconName = String(draft.icon_name || '').trim();
      const nextTab = String(draft.onglet_id || '').trim();
      const nextVisibility = draft.visibilite_client;
      const unchanged =
        nextName === String(feature.nom || '').trim() &&
        nextType === currentType &&
        draft.choix.trim() === currentChoices &&
        nextUnit === currentUnit &&
        nextIconName === currentIconName &&
        nextTab === currentTab &&
        nextVisibility === currentVisibility;
      if (unchanged) continue;
      if (!nextName) continue;
      if (nextType === 'valeur' && !nextUnit) continue;
      if ((nextType === 'choix_multiple' || nextType === 'plusieurs_choix') && nextChoices.length === 0) continue;

      let response: Response | null = null;
      for (const base of featureApiBases) {
        const next = await fetch(`${base}/${encodeURIComponent(feature.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode_bien: mode,
            type_bien: type,
            bien_id: initialData?.id || null,
            nom: nextName,
            type_caracteristique: nextType,
            choix: (nextType === 'choix_multiple' || nextType === 'plusieurs_choix') ? nextChoices : [],
            unite: nextType === 'valeur' ? nextUnit : null,
            icon_name: nextIconName || null,
            onglet_id: nextTab || null,
            visibilite_client: nextVisibility,
          }),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) {
        throw new Error(`Failed to update feature ${feature.id}`);
      }
    }
  };

  const handleAddZone = async () => {
    const normalizeMapsInput = (raw: string) => {
      const value = String(raw || '').trim();
      if (!value) return '';
      const iframeSrcMatch = value.match(/<iframe[^>]*\s+src=["']([^"']+)["']/i);
      const extracted = iframeSrcMatch?.[1] || value;
      return extracted.replace(/&amp;/g, '&').trim();
    };

    const hasAnyZoneField = [
      newZonePays,
      newZoneGouvernerat,
      newZoneRegion,
      newZoneQuartier,
    ].some((value) => String(value || '').trim().length > 0);
    if (!hasAnyZoneField) return toast.error('Renseignez au moins un champ de zone');
    try {
      const computedNom = [newZoneQuartier.trim(), newZoneRegion.trim(), newZoneGouvernerat.trim(), newZonePays.trim()].filter(Boolean).join(', ');
      const zoneId = `z${Date.now()}`;
      const zoneReference = computedNom || zoneId;
      let uploadedZoneImageUrl: string | null = null;
      if (newZoneImageFile) {
        setNewZoneImageUploading(true);
        const uploadPayload = new FormData();
        uploadPayload.append('image', newZoneImageFile);
        uploadPayload.append('upload_scope', 'zone');
        uploadPayload.append('zone_id', zoneId);
        uploadPayload.append('zone_reference', zoneReference);
        const uploadResponse = await fetch(`${API_URL}/upload`, {
          method: 'POST',
          body: uploadPayload,
        });
        if (!uploadResponse.ok) throw new Error('Echec upload image zone');
        const uploadResult = await uploadResponse.json();
        uploadedZoneImageUrl = String(uploadResult?.url || '').trim() || null;
      }
      const payload = {
        id: zoneId,
        nom: computedNom || `Zone ${Date.now()}`,
        pays: newZonePays.trim() || null,
        gouvernerat: newZoneGouvernerat.trim() || null,
        region: newZoneRegion.trim() || null,
        quartier: newZoneQuartier.trim() || null,
        google_maps_url: normalizeMapsInput(newZoneGoogleMapsUrl) || null,
        image_url: uploadedZoneImageUrl,
        quartier_image_url: uploadedZoneImageUrl,
      };
      const response = await fetch(`${API_URL}/zones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('Failed to create zone');
      const createdZone = await response.json();
      setZonesOptions([...zonesOptions, createdZone]);
      setFormData(prev => ({ ...prev, zone_id: createdZone.id }));
      setNewZonePays('');
      setNewZoneGouvernerat('');
      setNewZoneRegion('');
      setNewZoneQuartier('');
      setNewZoneGoogleMapsUrl('');
      setNewZoneImageFile(null);
      setNewZoneImagePreview('');
      setShowAddZone(false);
      toast.success('Zone ajoutÃ©e');
    } catch {
      toast.error('Erreur ajout zone');
    } finally {
      setNewZoneImageUploading(false);
    }
  };

  const handleUpdateSelectedZoneImage = async () => {
    const zoneId = String(formData.zone_id || '').trim();
    if (!zoneId) return toast.error('Aucune zone selectionnee');
    if (!selectedZoneImageFile) return toast.error('Choisissez une image');
    const zone = zonesOptions.find((item) => item.id === zoneId);
    if (!zone) return toast.error('Zone introuvable');
    try {
      setSelectedZoneImageUploading(true);
      const uploadPayload = new FormData();
      uploadPayload.append('image', selectedZoneImageFile);
      uploadPayload.append('upload_scope', 'zone');
      uploadPayload.append('zone_id', zoneId);
      uploadPayload.append('zone_reference', String(zone.nom || zoneId));
      const uploadResponse = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: uploadPayload,
      });
      if (!uploadResponse.ok) throw new Error('Echec upload image zone');
      const uploadResult = await uploadResponse.json();
      const imageUrl = String(uploadResult?.url || '').trim();
      if (!imageUrl) throw new Error('URL image zone invalide');

      const sameToken = (a?: string | null, b?: string | null) => normalizeZoneToken(a) === normalizeZoneToken(b);
      const imageFieldByTarget: Record<typeof selectedZoneImageTarget, 'quartier_image_url' | 'region_image_url' | 'gouvernerat_image_url' | 'pays_image_url'> = {
        quartier: 'quartier_image_url',
        region: 'region_image_url',
        gouvernerat: 'gouvernerat_image_url',
        pays: 'pays_image_url',
      };
      const targetImageField = imageFieldByTarget[selectedZoneImageTarget];
      const targetZones = zonesOptions.filter((item) => {
        if (selectedZoneImageTarget === 'quartier') {
          return sameToken(item.pays, zone.pays)
            && sameToken(item.gouvernerat, zone.gouvernerat)
            && sameToken(item.region, zone.region)
            && sameToken(item.quartier || item.nom, zone.quartier || zone.nom);
        }
        if (selectedZoneImageTarget === 'region') {
          return sameToken(item.pays, zone.pays)
            && sameToken(item.gouvernerat, zone.gouvernerat)
            && sameToken(item.region, zone.region);
        }
        if (selectedZoneImageTarget === 'gouvernerat') {
          return sameToken(item.pays, zone.pays)
            && sameToken(item.gouvernerat, zone.gouvernerat);
        }
        return sameToken(item.pays, zone.pays);
      });
      const uniqueTargetZones = targetZones.length > 0 ? targetZones : [zone];
      const updateResponses = await Promise.all(
        uniqueTargetZones.map(async (targetZone) => {
          const updatePayload = { [targetImageField]: imageUrl };
          const updateResponse = await fetch(`${API_URL}/zones/${encodeURIComponent(targetZone.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload),
          });
          if (!updateResponse.ok) {
            let serverMessage = 'Echec mise a jour zone';
            try {
              const errorPayload = await updateResponse.json();
              serverMessage = String(errorPayload?.error || errorPayload?.message || serverMessage);
            } catch {
              // ignore json parse errors and keep fallback message
            }
            if (
              updateResponse.status === 400
              && /aucune modification/i.test(serverMessage)
              && targetImageField !== 'image_url'
            ) {
              serverMessage = `${serverMessage}. Redemarrez le serveur API pour activer les champs image par niveau (pays/gouvernorat/region/quartier).`;
            }
            throw new Error(serverMessage);
          }
          return updateResponse.json();
        })
      );
      const updatedById = new Map<string, Zone>();
      updateResponses.forEach((updatedZone) => {
        const updatedId = String((updatedZone as Zone)?.id || '').trim();
        if (updatedId) updatedById.set(updatedId, updatedZone as Zone);
      });
      setZonesOptions((prev) => prev.map((item) => updatedById.get(item.id) || item));
      setSelectedZoneImageFile(null);
      setSelectedZoneImagePreview('');
      const targetLabelMap: Record<typeof selectedZoneImageTarget, string> = {
        quartier: 'quartier',
        region: 'region',
        gouvernerat: 'gouvernorat',
        pays: 'pays',
      };
      const targetValue = selectedZoneImageTarget === 'pays'
        ? String(zone.pays || '').trim()
        : selectedZoneImageTarget === 'gouvernerat'
          ? String(zone.gouvernerat || '').trim()
          : selectedZoneImageTarget === 'region'
            ? String(zone.region || '').trim()
            : String(zone.quartier || zone.nom || '').trim();
      toast.success(`Image ${targetLabelMap[selectedZoneImageTarget]} mise a jour: ${targetValue || '-'}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur mise a jour photo zone';
      toast.error(message);
    } finally {
      setSelectedZoneImageUploading(false);
    }
  };

  const handleAddProprietaire = async () => {
    const firstName = newOwnerFirstName.trim();
    const lastName = newOwnerName.trim();
    if (!firstName) return toast.error('Prénom du propriétaire requis');
    if (!lastName) return toast.error('Nom du propriétaire requis');
    const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();
    const ownerEmail = newOwnerEmail.trim();
    const ownerPhone = newOwnerPhone.trim();
    const ownerCin = newOwnerCin.trim();
    try {
      const payload = {
        nom: fullName,
        telephone: ownerPhone,
        email: ownerEmail,
        cin: ownerCin,
      };
      const response = await fetch(`${API_URL}/proprietaires`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to create owner');
      const createdOwner = await response.json();

      if (ownerEmail) {
        const utilisateursResponse = await fetch(`${API_URL}/utilisateurs`, { credentials: 'include' });
        const utilisateurs = utilisateursResponse.ok ? await utilisateursResponse.json() : [];
        const existingUser = Array.isArray(utilisateurs)
          ? utilisateurs.find((item) => String(item?.email || '').trim().toLowerCase() === ownerEmail.toLowerCase())
          : null;

        const utilisateurPayload = {
          nom: fullName,
          email: ownerEmail,
          role: 'user',
          telephone: ownerPhone || null,
          client_type: 'proprietaire',
          cin: ownerCin || null,
          cin_image_url: existingUser?.cin_image_url || null,
          avatar: existingUser?.avatar || null,
        };

        if (existingUser?.id) {
          const syncResponse = await fetch(`${API_URL}/utilisateurs/${encodeURIComponent(existingUser.id)}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(utilisateurPayload),
          });
          if (!syncResponse.ok) {
            throw new Error('Failed to sync owner user');
          }
        } else {
          const createUserResponse = await fetch(`${API_URL}/utilisateurs`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(utilisateurPayload),
          });
          if (!createUserResponse.ok) {
            throw new Error('Failed to create owner user');
          }
        }
      }

      setProprietaireOptions([...proprietaireOptions, createdOwner]);
      setFormData(prev => ({ ...prev, proprietaire_id: createdOwner.id }));
      setNewOwnerFirstName('');
      setNewOwnerName('');
      setNewOwnerPhone('');
      setNewOwnerEmail('');
      setNewOwnerCin('');
      setShowAddProprietaire(false);
      toast.success('Propriétaire ajouté');
    } catch {
      toast.error('Erreur ajout propriétaire');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const allIssues = [1, 2, 3, 4, 5].flatMap((step) => getStepValidationIssues(step as 1 | 2 | 3 | 4 | 5));
    if (allIssues.length > 0) {
      openValidationDialog(allIssues);
      return;
    }

    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType(formData.type as BienType);
    const tarificationMethode = (formData.tarification_methode || 'avec_commission') as TarificationMethodeVente;
    const venteTarification = computeVenteTarification(formData);
    const isAppartementVente = selectedMode === 'vente' && selectedType === 'appartement';
    const isLocalCommercialVente = selectedMode === 'vente' && selectedType === 'local_commercial';
    const isTerrainVente = selectedMode === 'vente' && selectedType === 'terrain';
    const isLotissementVente = selectedMode === 'vente' && selectedType === 'lotissement';
    const isImmeubleVente = selectedMode === 'vente' && selectedType === 'immeuble';

    try {
      await savePendingFeatureDrafts(selectedMode, selectedType);
      await loadAvailableFeatures(selectedMode, selectedType);
    } catch {
      setGeneralStep(3);
      return toast.error('Erreur sauvegarde des modifications de caracteristiques');
    }

    const orderedMediaForSave = [...clientVisibleImages, ...clientVisibleVideos, ...images.filter((img) => isProofImage(img))];
    const imagesWithPositions = orderedMediaForSave.map((img, idx) => ({ ...img, position: idx }));
    const ventePaiement = computeVentePaiement(formData, venteTarification.prixFinal);
    const selectedFeatureEntries = availableFeatures
      .filter((feature) => selectedFeatureIds.includes(String(feature.id || '')))
      .map((feature) => {
        const featureId = String(feature.id || '');
        const featureType = normalizeFeatureType(feature.type_caracteristique);
        let value: string | number | null = null;

        if (featureType === 'choix_multiple') {
          value = String((featureChoiceValuesById[featureId] || [])[0] || '').trim() || null;
        } else if (featureType === 'plusieurs_choix') {
          value = (featureChoiceValuesById[featureId] || []).map((item) => String(item || '').trim()).filter(Boolean).join(', ');
        } else {
          value = String(featureValueById[featureId] || '').trim() || null;
        }

        return {
          name: String(feature.nom || '').trim(),
          value,
          tabLabel: String(
            featureTabs.find((tab) => String(tab.id || '') === String(feature.onglet_id || ''))?.nom
            || feature.onglet_id
            || ''
          ),
        };
      });
    const derivedSeasonSignals = deriveSeasonFilterSignalsFromFeatures(selectedFeatureEntries);
    const derivedCapacity = extractCapacityFromEntries(selectedFeatureEntries);
    const resolvedConfiguration =
      String(formData.configuration || '').trim()
      || String(derivedCapacity.configuration || '').trim()
      || null;
    const resolvedReference = String(formData.reference || '').trim() || generateReference();
    const explicitNbChambres = toNonNegativeIntegerOrNull(formData.nb_chambres);
    const explicitNbSalleBain = toNonNegativeIntegerOrNull(formData.nb_salle_bain);
    const resolvedNbChambres = isAppartementVente
      ? deriveBedroomsFromConfiguration(resolvedConfiguration)
      : isLocalCommercialVente
        ? 0
        : isTerrainVente
          ? 0
          : isLotissementVente
            ? 0
          : isImmeubleVente
            ? 0
        : explicitNbChambres ?? derivedCapacity.bedrooms ?? 0;
    const resolvedNbSalleBain = (isLocalCommercialVente || isTerrainVente || isLotissementVente || isImmeubleVente)
      ? 0
      : explicitNbSalleBain ?? derivedCapacity.bathrooms ?? 0;
    const appartementVenteData = isAppartementVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          superficie_m2: formData.superficie_m2 ?? null,
          etage: formData.etage ?? null,
          configuration: formData.configuration || null,
          annee_construction: formData.annee_construction ?? null,
          distance_plage_m: formData.distance_plage_m ?? null,
          proche_plage: !!formData.proche_plage,
          chauffage_central: !!formData.chauffage_central,
          climatisation: !!formData.climatisation,
          balcon: !!formData.balcon,
          terrasse: !!formData.terrasse,
          ascenseur: !!formData.ascenseur,
          vue_mer: !!formData.vue_mer,
          gaz_ville: !!formData.gaz_ville,
          cuisine_equipee: !!formData.cuisine_equipee,
          place_parking: !!formData.place_parking,
          syndic: !!formData.syndic,
          meuble: !!formData.meuble,
          independant: !!formData.independant,
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
          type_rue: null,
          type_papier: null,
          superficie_m2: null,
          etage: null,
          configuration: resolvedConfiguration,
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
        };
    const localCommercialVenteData = isLocalCommercialVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          surface_local_m2: formData.surface_local_m2 ?? null,
          facade_m: formData.facade_m ?? null,
          hauteur_plafond_m: formData.hauteur_plafond_m ?? null,
          activite_recommandee: formData.activite_recommandee || null,
          toilette: !!formData.toilette,
          reserve_local: !!formData.reserve_local,
          vitrine: !!formData.vitrine,
          coin_angle: !!formData.coin_angle,
          electricite_3_phases: !!formData.electricite_3_phases,
          gaz_ville: !!formData.gaz_ville,
          alarme: !!formData.alarme,
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
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
        };
    const terrainVenteData = isTerrainVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          type_terrain: formData.type_terrain || null,
          terrain_facade_m: formData.terrain_facade_m ?? null,
          terrain_surface_m2: formData.terrain_surface_m2 ?? null,
          terrain_distance_plage_m: formData.terrain_distance_plage_m ?? null,
          terrain_zone: formData.terrain_zone || null,
          terrain_constructible: !!formData.terrain_constructible,
          terrain_angle: !!formData.terrain_angle,
          terrain_prix_affiche_total: formData.terrain_prix_affiche_total ?? null,
          terrain_prix_affiche_par_m2: formData.terrain_prix_affiche_par_m2 ?? null,
          terrain_mode_affichage_prix: formData.terrain_mode_affichage_prix || 'total_et_m2',
          terrain_disponibilite_reseaux: Array.isArray(formData.terrain_disponibilite_reseaux) ? formData.terrain_disponibilite_reseaux : [],
          terrain_hauteur_construction_autorisee: formData.terrain_hauteur_construction_autorisee || null,
          terrain_route_acces_largeur_m: formData.terrain_route_acces_largeur_m ?? null,
          terrain_forme: formData.terrain_forme || null,
          terrain_topographie: formData.terrain_topographie || null,
          terrain_bornage: !!formData.terrain_bornage,
          terrain_travaux_municipalite_autorises: !!formData.terrain_travaux_municipalite_autorises,
          terrain_limites_cadastrales: !!formData.terrain_limites_cadastrales,
          terrain_visualisation_limites_cadastrales: !!formData.terrain_visualisation_limites_cadastrales,
          terrain_voisinage: formData.terrain_voisinage || null,
          terrain_proximites_commodites: Array.isArray(formData.terrain_proximites_commodites) ? formData.terrain_proximites_commodites : [],
          terrain_proximites_commodites_autres: formData.terrain_proximites_commodites_autres || null,
          terrain_viabilisation_eau_sources: Array.isArray(formData.terrain_viabilisation_eau_sources) ? formData.terrain_viabilisation_eau_sources : [],
          terrain_viabilisation_onas: formData.terrain_viabilisation_onas || null,
          terrain_viabilisation_steg: formData.terrain_viabilisation_steg || null,
          terrain_viabilisation_gaz_ville: !!formData.terrain_viabilisation_gaz_ville,
          terrain_viabilisation_fibre_optique: !!formData.terrain_viabilisation_fibre_optique,
          terrain_viabilisation_telephone_fixe: !!formData.terrain_viabilisation_telephone_fixe,
          terrain_type_sol: formData.terrain_type_sol || null,
          terrain_vegetation: formData.terrain_vegetation || null,
          terrain_niveau_sonore: formData.terrain_niveau_sonore || null,
          terrain_risque_inondation: !!formData.terrain_risque_inondation,
          terrain_exposition_vent: formData.terrain_exposition_vent || null,
          terrain_ideal_utilisations: Array.isArray(formData.terrain_ideal_utilisations) ? formData.terrain_ideal_utilisations : [],
          terrain_documents_disponibles: Array.isArray(formData.terrain_documents_disponibles) ? formData.terrain_documents_disponibles : [],
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
          type_terrain: null,
          terrain_facade_m: null,
          terrain_surface_m2: null,
          terrain_distance_plage_m: null,
          terrain_zone: null,
          terrain_constructible: false,
          terrain_angle: false,
          terrain_prix_affiche_total: null,
          terrain_prix_affiche_par_m2: null,
          terrain_mode_affichage_prix: null,
          terrain_disponibilite_reseaux: [],
          terrain_hauteur_construction_autorisee: null,
          terrain_route_acces_largeur_m: null,
          terrain_forme: null,
          terrain_topographie: null,
          terrain_bornage: false,
          terrain_travaux_municipalite_autorises: false,
          terrain_limites_cadastrales: false,
          terrain_visualisation_limites_cadastrales: false,
          terrain_voisinage: null,
          terrain_proximites_commodites: [],
          terrain_proximites_commodites_autres: null,
          terrain_viabilisation_eau_sources: [],
          terrain_viabilisation_onas: null,
          terrain_viabilisation_steg: null,
          terrain_viabilisation_gaz_ville: false,
          terrain_viabilisation_fibre_optique: false,
          terrain_viabilisation_telephone_fixe: false,
          terrain_type_sol: null,
          terrain_vegetation: null,
          terrain_niveau_sonore: null,
          terrain_risque_inondation: false,
          terrain_exposition_vent: null,
          terrain_ideal_utilisations: [],
          terrain_documents_disponibles: [],
        };
    const lotissementVenteData = isLotissementVente
      ? {
          lotissement_nb_terrains: formData.lotissement_nb_terrains ?? 1,
          lotissement_prix_total: formData.lotissement_prix_total ?? null,
          lotissement_mode_prix_m2: formData.lotissement_mode_prix_m2 || 'm2_unique',
          lotissement_prix_m2_unique: formData.lotissement_prix_m2_unique ?? null,
          lotissement_terrains: Array.isArray(formData.lotissement_terrains) ? formData.lotissement_terrains : [],
          lotissement_paliers_prix_m2: Array.isArray(formData.lotissement_paliers_prix_m2) ? formData.lotissement_paliers_prix_m2 : [],
        }
      : {
          lotissement_nb_terrains: null,
          lotissement_prix_total: null,
          lotissement_mode_prix_m2: null,
          lotissement_prix_m2_unique: null,
          lotissement_terrains: [],
          lotissement_paliers_prix_m2: [],
        };
    const immeubleVenteData = isImmeubleVente
      ? {
          type_rue: formData.type_rue || null,
          type_papier: formData.type_papier || null,
          immeuble_surface_terrain_m2: formData.immeuble_surface_terrain_m2 ?? null,
          immeuble_surface_batie_m2: formData.immeuble_surface_batie_m2 ?? null,
          immeuble_nb_niveaux: formData.immeuble_nb_niveaux ?? null,
          immeuble_nb_garages: formData.immeuble_nb_garages ?? null,
          immeuble_nb_appartements: formData.immeuble_nb_appartements ?? null,
          immeuble_nb_locaux_commerciaux: formData.immeuble_nb_locaux_commerciaux ?? null,
          immeuble_distance_plage_m: formData.immeuble_distance_plage_m ?? null,
          immeuble_proche_plage: !!formData.immeuble_proche_plage,
          immeuble_ascenseur: !!formData.immeuble_ascenseur,
          immeuble_parking_sous_sol: !!formData.immeuble_parking_sous_sol,
          immeuble_parking_exterieur: !!formData.immeuble_parking_exterieur,
          immeuble_syndic: !!formData.immeuble_syndic,
          immeuble_vue_mer: !!formData.immeuble_vue_mer,
          immeuble_appartements: Array.isArray(formData.immeuble_appartements) ? formData.immeuble_appartements : [],
          immeuble_garages: Array.isArray(formData.immeuble_garages) ? formData.immeuble_garages : [],
          immeuble_locaux_commerciaux: Array.isArray(formData.immeuble_locaux_commerciaux) ? formData.immeuble_locaux_commerciaux : [],
          eau_puits: !!formData.eau_puits,
          eau_sonede: !!formData.eau_sonede,
          electricite_steg: !!formData.electricite_steg,
        }
      : {
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
          immeuble_garages: [],
          immeuble_locaux_commerciaux: [],
        };
    const caracteristiqueValeurs: Record<string, string | string[]> = {};
    for (const feature of availableFeatures) {
      const featureId = String(feature.id || '');
      if (!featureId || !selectedFeatureIds.includes(featureId)) continue;
      const featureType = normalizeFeatureType(feature.type_caracteristique);
      if (featureType === 'choix_multiple') {
        const selectedChoice = String((featureChoiceValuesById[featureId] || [])[0] || '').trim();
        if (selectedChoice) caracteristiqueValeurs[featureId] = [selectedChoice];
        continue;
      }
      if (featureType === 'plusieurs_choix') {
        const selectedChoices = (featureChoiceValuesById[featureId] || []).map((item) => String(item || '').trim()).filter(Boolean);
        if (selectedChoices.length > 0) caracteristiqueValeurs[featureId] = Array.from(new Set(selectedChoices));
        continue;
      }
      if (featureType === 'valeur' || featureType === 'texte') {
        const rawValue = String(featureValueById[featureId] || '').trim();
        if (rawValue) caracteristiqueValeurs[featureId] = rawValue;
      }
    }
    const persistedCaracteristiqueIds = Array.from(new Set([
      ...selectedFeatureIds.map((id) => String(id || '').trim()).filter(Boolean),
      ...Object.keys(caracteristiqueValeurs).map((id) => String(id || '').trim()).filter(Boolean),
    ]));
    const characteristicDisplayLines = availableFeatures
      .filter((feature) => selectedFeatureIds.includes(feature.id) && Number(feature.visibilite_client) !== 0)
      .map((feature) => {
        const featureType = normalizeFeatureType(feature.type_caracteristique);
        const featureId = String(feature.id || '');
        if (featureType === 'choix_multiple') {
          const selectedChoice = (featureChoiceValuesById[featureId] || [])[0] || '';
          return selectedChoice ? `${feature.nom}: ${selectedChoice}` : feature.nom;
        }
        if (featureType === 'plusieurs_choix') {
          const selectedChoices = featureChoiceValuesById[featureId] || [];
          return selectedChoices.length > 0 ? `${feature.nom}: ${selectedChoices.join(', ')}` : feature.nom;
        }
        if (featureType === 'valeur') {
          const rawValue = String(featureValueById[featureId] || '').trim();
          const unit = String(feature.unite || '').trim();
          return rawValue ? `${feature.nom}: ${rawValue}${unit ? ` ${unit}` : ''}` : feature.nom;
        }
        if (featureType === 'texte') {
          const rawText = String(featureValueById[featureId] || '').trim();
          return rawText ? `${feature.nom}: ${rawText}` : feature.nom;
        }
        return feature.nom;
      });
    const finalData: Bien = {
      ...formData,
      reference: resolvedReference,
      nom_bien_mobile: String(formData.nom_bien_mobile || '').trim() || null,
      mode: selectedMode,
      type: selectedType,
      configuration: resolvedConfiguration,
      nb_chambres: resolvedNbChambres,
      nb_salle_bain: resolvedNbSalleBain,
      prix_nuitee: selectedMode === 'vente' ? venteTarification.prixAfficheClient : Number(formData.prix_nuitee || 0),
      prix_semaine: selectedMode === 'vente' ? null : (formData.prix_semaine === null || formData.prix_semaine === undefined ? null : Number(formData.prix_semaine || 0)),
      prix_proprietaire: formData.prix_proprietaire === null || formData.prix_proprietaire === undefined ? null : Number(formData.prix_proprietaire || 0),
      tarification_methode: selectedMode === 'vente' ? tarificationMethode : null,
      prix_affiche_client: selectedMode === 'vente' ? venteTarification.prixAfficheClient : null,
      prix_fixe_proprietaire: selectedMode === 'vente' ? venteTarification.prixFixeProprietaire : null,
      prix_final: selectedMode === 'vente' ? venteTarification.prixFinal : null,
      revenu_agence: selectedMode === 'vente' ? venteTarification.revenuAgence : null,
      commission_pourcentage_proprietaire: selectedMode === 'vente' ? venteTarification.commissionPourcentageProprietaire : null,
      commission_pourcentage_client: selectedMode === 'vente' ? venteTarification.commissionPourcentageClient : null,
      montant_max_reduction_negociation: selectedMode === 'vente' && tarificationMethode === 'sans_commission'
        ? Number(formData.montant_max_reduction_negociation ?? 0)
        : null,
      prix_minimum_accepte: selectedMode === 'vente' && tarificationMethode === 'sans_commission'
        ? venteTarification.prixMinimumAccepte
        : null,
      modalite_paiement_vente: selectedMode === 'vente' ? ventePaiement.modalite : null,
      pourcentage_premiere_partie_promesse: selectedMode === 'vente' ? ventePaiement.pourcentagePremierePartiePromesse : null,
      montant_premiere_partie_promesse: selectedMode === 'vente' ? ventePaiement.montantPremierePartiePromesse : null,
      montant_deuxieme_partie: selectedMode === 'vente' ? ventePaiement.montantDeuxiemePartie : null,
      nombre_tranches: selectedMode === 'vente' && ventePaiement.modalite === 'facilite' ? ventePaiement.nombreTranches : null,
      periode_tranches_mois: selectedMode === 'vente' && ventePaiement.modalite === 'facilite' ? ventePaiement.periodeTranchesMois : null,
      montant_par_tranche: selectedMode === 'vente' && ventePaiement.modalite === 'facilite' ? ventePaiement.montantParTranche : null,
      ...appartementVenteData,
      ...localCommercialVenteData,
      ...terrainVenteData,
      ...lotissementVenteData,
      ...immeubleVenteData,
      climatisation: selectedMode === 'location_saisonniere'
        ? (!!formData.climatisation || derivedSeasonSignals.climatisation)
        : !!(appartementVenteData as any).climatisation,
      terrasse: selectedMode === 'location_saisonniere'
        ? (!!formData.terrasse || derivedSeasonSignals.terrasse)
        : !!(appartementVenteData as any).terrasse,
      vue_mer: selectedMode === 'location_saisonniere'
        ? (!!formData.vue_mer || derivedSeasonSignals.vueMer)
        : !!(appartementVenteData as any).vue_mer,
      proche_plage: selectedMode === 'location_saisonniere'
        ? (!!formData.proche_plage || derivedSeasonSignals.prochePlage)
        : !!(appartementVenteData as any).proche_plage,
      distance_plage_m: selectedMode === 'location_saisonniere'
        ? ((formData.distance_plage_m ?? derivedSeasonSignals.distancePlageM) ?? null)
        : ((appartementVenteData as any).distance_plage_m ?? null),
      location_saisonniere_config: selectedMode === 'location_saisonniere'
        ? {
            ...saisonConfig,
            nom_bien_mobile: String(formData.nom_bien_mobile || '').trim() || null,
            etage: saisonConfig.etage || (derivedSeasonSignals.rdc ? 'rdc' : saisonConfig.etage),
            vue: saisonConfig.vue === 'sans_vue' && derivedSeasonSignals.vueMer ? 'mer' : saisonConfig.vue,
            exterieur_jardin: derivedSeasonSignals.exterieurJardin.length > 0
              ? derivedSeasonSignals.exterieurJardin
              : ((saisonConfig as any).exterieur_jardin || []),
            confort_equipements_interieurs: derivedSeasonSignals.confortEquipementsInterieurs.length > 0
              ? derivedSeasonSignals.confortEquipementsInterieurs
              : ((saisonConfig as any).confort_equipements_interieurs || []),
            climatisation: !!formData.climatisation || derivedSeasonSignals.climatisation,
            terrasse: !!formData.terrasse || derivedSeasonSignals.terrasse,
            vue_mer: !!formData.vue_mer || derivedSeasonSignals.vueMer,
            proche_plage: !!formData.proche_plage || derivedSeasonSignals.prochePlage,
            distance_plage_m: (formData.distance_plage_m ?? derivedSeasonSignals.distancePlageM) ?? null,
          }
        : null,
      description: buildDescriptionWithCharacteristics(formData.description || '', characteristicDisplayLines),
      caracteristiques: characteristicDisplayLines,
      caracteristique_ids: persistedCaracteristiqueIds,
      caracteristique_valeurs: caracteristiqueValeurs,
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      media: imagesWithPositions,
      unavailableDates: unavailableDates,
      pricing_periods: pricingPeriods,
      visible_sur_site: formData.visible_sur_site !== false,
      is_featured: formData.is_featured === true,
      created_at: initialData?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      date_ajout: initialData?.date_ajout || new Date().toISOString().split('T')[0]
    } as Bien;
    (finalData as any).deleted_media_ids = deletedMediaIds;
    markStepValidated(selectedMode === 'vente' ? 5 : 4);
    await onSubmit(finalData);
  };
  const selectedProprietaire = proprietaireOptions.find((p) => p.id === (formData.proprietaire_id || ''));
  const normalizeZoneToken = (value?: string | null) => String(value || '').trim().toLowerCase();
  const paysOptions = Array.from(new Set(zonesOptions.map((z) => String(z.pays || '').trim()).filter(Boolean)));
  const gouverneratOptions = Array.from(new Set(
    zonesOptions
      .filter((z) => !newZonePays.trim() || normalizeZoneToken(z.pays) === normalizeZoneToken(newZonePays))
      .map((z) => String(z.gouvernerat || '').trim())
      .filter(Boolean)
  ));
  const regionOptions = Array.from(new Set(
    zonesOptions
      .filter((z) =>
        (!newZonePays.trim() || normalizeZoneToken(z.pays) === normalizeZoneToken(newZonePays))
        && (!newZoneGouvernerat.trim() || normalizeZoneToken(z.gouvernerat) === normalizeZoneToken(newZoneGouvernerat))
      )
      .map((z) => String(z.region || '').trim())
      .filter(Boolean)
  ));
  const quartierOptions = Array.from(new Set(
    zonesOptions
      .filter((z) =>
        (!newZonePays.trim() || normalizeZoneToken(z.pays) === normalizeZoneToken(newZonePays))
        && (!newZoneGouvernerat.trim() || normalizeZoneToken(z.gouvernerat) === normalizeZoneToken(newZoneGouvernerat))
        && (!newZoneRegion.trim() || normalizeZoneToken(z.region) === normalizeZoneToken(newZoneRegion))
      )
      .map((z) => String(z.quartier || '').trim())
      .filter(Boolean)
  ));
  const isAppartementVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'appartement';
  const isLocalCommercialVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'local_commercial';
  const isTerrainVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'terrain';
  const isLotissementVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'lotissement';
  const isImmeubleVente = (formData.mode || 'location_saisonniere') === 'vente' && normalizeLegacyType((formData.type || 'appartement') as BienType) === 'immeuble';
  const selectedModeForUi = (formData.mode || 'location_saisonniere') as BienMode;
  const isLocationAppartement = selectedModeForUi !== 'vente';
  const uiSectionOptions = selectedModeForUi === 'vente' ? UI_SECTION_OPTIONS_VENTE : UI_SECTION_OPTIONS_LOCATION;
  const terrainTabsForRender = featureTabs
    .slice()
    .sort((a, b) => Number(a.ordre || 999) - Number(b.ordre || 999))
    .map((tab) => ({ id: tab.id, label: String(tab.nom || tab.id), is_system: Number(tab.is_system || 0) === 1 }))
    .filter((tab) => !isRemovedAdminTabLabel(tab.label));
  const tabFeatureCountQuick = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const feature of availableFeatures) {
      const tabId = String(feature.onglet_id || '').trim();
      if (!tabId) continue;
      counts[tabId] = (counts[tabId] || 0) + 1;
    }
    return counts;
  }, [availableFeatures]);
  const detailTabsForRenderBase = (featureTabs.length > 0 ? featureTabs : DEFAULT_DETAILS_TABS)
    .slice()
    .sort((a, b) => Number(a.ordre || 999) - Number(b.ordre || 999))
    .map((tab) => ({ id: tab.id, label: String(tab.nom || tab.id), is_system: Number(tab.is_system || 0) === 1 }))
    .filter((tab) => !isRemovedAdminTabLabel(tab.label));
  const canonicalLocationTabs: Array<{ key: string; label: string }> = [
    { key: 'informations_generales', label: 'Informations generales' },
    { key: 'localisation_acces', label: 'Localisation & acces' },
    { key: 'caracteristiques', label: 'Exterieur & jardin' },
    { key: 'lits_couchage', label: 'Lits & couchage' },
    { key: 'conforts_equipements_interieurs', label: 'Conforts & equipements interieurs' },
    { key: 'securite_reglement', label: 'Securite & reglement' },
    { key: 'conditions_reservation', label: 'Conditions de reservation' },
    { key: 'accessibilite', label: 'Accessibilite' },
    { key: 'capacite_configuration', label: 'Capacite & configuration' },
    { key: 'cuisine_repas', label: 'Cuisine & repas' },
  ];
  const detectCanonicalLocationTabKey = (label?: string | null) => {
    const normalized = normalizeFeatureName(String(label || '').replace(/^\s*\d+\s*[\.\-:)]\s*/g, ''));
    if (normalized.includes('information')) return 'informations_generales';
    if (normalized.includes('localisation')) return 'localisation_acces';
    if (normalized.includes('caracteristique') || normalized.includes('exterieur') || normalized.includes('jardin')) return 'caracteristiques';
    if (normalized.includes('lits') || normalized.includes('couchage')) return 'lits_couchage';
    if (normalized.includes('confort') || normalized.includes('equipement')) return 'conforts_equipements_interieurs';
    if (normalized.includes('securite') || normalized.includes('reglement')) return 'securite_reglement';
    if (normalized.includes('condition') || normalized.includes('reservation')) return 'conditions_reservation';
    if (normalized.includes('accessibil')) return 'accessibilite';
    if (normalized.includes('capacite') || normalized.includes('configuration')) return 'capacite_configuration';
    if (normalized.includes('cuisine') || normalized.includes('repas')) return 'cuisine_repas';
    return '';
  };
  let detailTabsForRender = detailTabsForRenderBase;
  if (selectedModeForUi === 'location_saisonniere') {
    const canonicalMap = new Map<string, { id: string; label: string; is_system: boolean }>();
    const extraTabs: Array<{ id: string; label: string; is_system: boolean }> = [];
    for (const tab of detailTabsForRenderBase) {
      const canonicalKey = detectCanonicalLocationTabKey(tab.label);
      if (!canonicalKey) {
        extraTabs.push(tab);
        continue;
      }
      if (!canonicalMap.has(canonicalKey)) {
        canonicalMap.set(canonicalKey, { ...tab });
      } else {
        const current = canonicalMap.get(canonicalKey)!;
        const currentCount = Number(tabFeatureCountQuick[current.id] || 0);
        const candidateCount = Number(tabFeatureCountQuick[tab.id] || 0);
        if (candidateCount > currentCount) {
          canonicalMap.set(canonicalKey, { ...tab });
        }
      }
    }
    detailTabsForRender = [
      ...canonicalLocationTabs.map((tab) => {
        const existing = canonicalMap.get(tab.key);
        if (existing) return { ...existing, label: tab.label };
        return { id: `__canonical_${tab.key}`, label: tab.label, is_system: true };
      }),
      ...extraTabs,
    ];
  }
  const visibleFeatureTabs = featureTabs.filter((tab) => !isRemovedAdminTabLabel(String(tab.nom || tab.id)));
  const uiConfig = (formData.ui_config || {}) as BienUiConfig;
  const isUiSectionVisible = (key: keyof BienUiConfig) => uiConfig[key] !== false;
  const visibleFeaturesForSelectedTabRaw = selectedFeatureTabId
    ? availableFeatures.filter((feature) => String(feature.onglet_id || '') === selectedFeatureTabId)
    : [];
  const unassignedFeatures = availableFeatures.filter((feature) => !String(feature.onglet_id || '').trim());
  const terrainTabFeatures = availableFeatures.filter((feature) => (feature.onglet_id || '') === terrainSectionTab);
  const detailTabFeaturesRaw = availableFeatures.filter((feature) => String(feature.onglet_id || '') === detailSectionTabId);
  const activeDetailTabCanonicalKey = detectCanonicalLocationTabKey(detailTabsForRender.find((tab) => tab.id === detailSectionTabId)?.label || '');
  const LOCATION_TAB_FEATURE_ALLOWLIST: Record<string, string[]> = {
    informations_generales: [
      'nombre de chambres global',
      'nombre de sdb global',
      'categorie standing',
      'etage',
      'ascenseur',
      'vue',
      'niveau sonore',
    ],
    localisation_acces: [
      'acces general',
      'distance centre ville',
      'distance commerces',
      'distance plage',
      'distance restaurants cafes',
      'stationnement proche',
      'type de route',
      'type quartier',
    ],
    caracteristiques: ['*'],
    lits_couchage: [
      'canape lit',
      'lit bebe',
      'lit double',
      'lit simple',
    ],
    conforts_equipements_interieurs: [
      'climatisation',
      'fer a repasser',
      'seche cheveux',
      'ventilateurs',
    ],
    securite_reglement: [
      'cameras',
      'fetes',
      'heures silence',
      'type acces logement',
      'visiteurs',
    ],
    conditions_reservation: [
      'duree max sejour nuits',
      'duree max sejour nuits nuit',
      'duree min sejour nuits nuit',
      'montant caution dt',
      'politique annulation',
      'type caution',
    ],
    accessibilite: ['rampes', 'rdc'],
    capacite_configuration: [
      'capacite bebes angel',
      'capacite enfants personne',
      'capacite max adultes personne',
      'nombre chambres double chambre',
      'nombre chambres parentale chambre',
      'nombre chambres simple chambre',
      'nombre salles de bain sdb',
      'nombre salons salon',
    ],
    cuisine_repas: ['nombre chaises chaises', 'type cuisine'],
  };
  const isFeatureAllowedForCleanLocationTab = (feature: Caracteristique, canonicalTabKey: string) => {
    const allowed = LOCATION_TAB_FEATURE_ALLOWLIST[canonicalTabKey] || [];
    if (allowed.includes('*')) return true;
    if (allowed.length === 0) return false;
    const normalizedName = normalizeFeatureName(String(feature.nom || '').replace(/[^a-z0-9]+/gi, ' '));
    return allowed.some((token) => normalizedName.includes(token) || token.includes(normalizedName));
  };
  const resolveFeatureTabIdFromDetailTab = (detailTabId: string) => {
    const directMatch = visibleFeatureTabs.find((tab) => tab.id === detailTabId);
    if (directMatch) return directMatch.id;
    if (selectedModeForUi !== 'location_saisonniere') return '';
    const detailLabel = detailTabsForRender.find((tab) => tab.id === detailTabId)?.label || '';
    const canonicalKey = detectCanonicalLocationTabKey(detailLabel);
    if (!canonicalKey) return '';
    const candidates = visibleFeatureTabs.filter((tab) => detectCanonicalLocationTabKey(String(tab.nom || '')) === canonicalKey);
    if (candidates.length === 0) return '';
    candidates.sort((a, b) => Number(tabFeatureCountQuick[b.id] || 0) - Number(tabFeatureCountQuick[a.id] || 0));
    return candidates[0]?.id || '';
  };
  const selectedFeatureTabCanonicalKey = detectCanonicalLocationTabKey(
    visibleFeatureTabs.find((tab) => tab.id === selectedFeatureTabId)?.nom || ''
  );
  const visibleFeaturesForSelectedTab = (selectedModeForUi === 'location_saisonniere' && selectedFeatureTabCanonicalKey)
    ? visibleFeaturesForSelectedTabRaw.filter((feature) => isFeatureAllowedForCleanLocationTab(feature, selectedFeatureTabCanonicalKey))
    : visibleFeaturesForSelectedTabRaw;
  const detailTabFeatures = (selectedModeForUi === 'location_saisonniere' && activeDetailTabCanonicalKey)
    ? detailTabFeaturesRaw.filter((feature) => isFeatureAllowedForCleanLocationTab(feature, activeDetailTabCanonicalKey))
    : detailTabFeaturesRaw;
  const detailTabFeatureCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const feature of availableFeatures) {
      const tabId = String(feature.onglet_id || '').trim();
      if (!tabId) continue;
      counts[tabId] = (counts[tabId] || 0) + 1;
    }
    return counts;
  }, [availableFeatures]);
  const detailTabsWithFeatures = detailTabsForRender.filter((tab) => Number(detailTabFeatureCountById[tab.id] || 0) > 0);
  const step2SousTypeFeature = useMemo(() => {
    if (!isLocationAppartement) return null;
    const candidates = availableFeatures.filter((feature) => {
      const featureType = normalizeFeatureType(feature.type_caracteristique);
      if (featureType !== 'choix_multiple' && featureType !== 'plusieurs_choix') return false;
      const normalizedName = normalizeFeatureName(String(feature.nom || '').replace(/[^a-z0-9]+/gi, ' '));
      return normalizedName === 'sous type'
        || normalizedName.includes('sous type')
        || normalizedName.startsWith('configuration');
    });
    if (candidates.length === 0) return null;
    const infoGeneralFeature = candidates.find((feature) => normalizeFeatureName(String(feature.onglet_nom || '')).includes('information'));
    return infoGeneralFeature || candidates[0];
  }, [availableFeatures, isLocationAppartement]);
  const step2SousTypeOptions = useMemo(
    () => {
      const fromFeature = step2SousTypeFeature ? parseFeatureChoices(stringifyFeatureChoices(step2SousTypeFeature.choix_json)) : [];
      const fromConfiguration = String(formData.configuration || '').trim();
      return Array.from(new Set([...fromFeature, ...(fromConfiguration ? [fromConfiguration] : [])]));
    },
    [formData.configuration, step2SousTypeFeature]
  );
  const step2SousTypeSelectedValue = useMemo(() => {
    const configurationValue = String(formData.configuration || '').trim();
    if (configurationValue) return configurationValue;
    if (!step2SousTypeFeature) return '';
    return String((featureChoiceValuesById[String(step2SousTypeFeature.id || '')] || [])[0] || '').trim();
  }, [featureChoiceValuesById, formData.configuration, step2SousTypeFeature]);
  const handleStep2SousTypeChange = (rawValue: string) => {
    const nextValue = String(rawValue || '').trim();
    setFormData((prev) => ({ ...prev, configuration: nextValue || null }));
    const featureId = String(step2SousTypeFeature?.id || '').trim();
    if (!featureId) return;
    setFeatureChoiceValuesById((prev) => ({ ...prev, [featureId]: nextValue ? [nextValue] : [] }));
    setFeatureSelected(featureId, nextValue.length > 0);
  };
  const handleAddSousTypeChoice = async () => {
    const nextChoice = String(newSousTypeChoice || '').trim();
    if (!nextChoice) return toast.error('Saisissez un choix');
    const currentOptions = Array.from(new Set(step2SousTypeOptions.map((item) => String(item || '').trim()).filter(Boolean)));
    if (currentOptions.includes(nextChoice)) {
      handleStep2SousTypeChange(nextChoice);
      setNewSousTypeChoice('');
      return toast.success('Choix deja present');
    }
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    setIsSavingSousTypeChoice(true);
    try {
      if (step2SousTypeFeature?.id) {
        const featureId = String(step2SousTypeFeature.id || '').trim();
        const draft = featureDrafts[featureId];
        const nextChoices = Array.from(new Set([
          ...parseFeatureChoices(stringifyFeatureChoices(step2SousTypeFeature.choix_json)),
          nextChoice,
        ]));
        const featureApiBases = getFeatureApiBases();
        let response: Response | null = null;
        for (const base of featureApiBases) {
          const next = await fetch(`${base}/${encodeURIComponent(featureId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode_bien: selectedMode,
              type_bien: selectedType,
              apply_to_all: true,
              nom: String(draft?.nom || step2SousTypeFeature.nom || 'Sous-type').trim(),
              type_caracteristique: 'choix_multiple',
              choix: nextChoices,
              unite: null,
              icon_name: draft?.icon_name || step2SousTypeFeature.icon_name || null,
              onglet_id: draft?.onglet_id || step2SousTypeFeature.onglet_id || null,
              visibilite_client: draft?.visibilite_client ?? (Number(step2SousTypeFeature.visibilite_client) === 0 ? 0 : 1),
            }),
          });
          response = next;
          if (next.ok || next.status !== 404) break;
        }
        if (!response || !response.ok) throw new Error('update feature sous-type');
        await loadAvailableFeatures(selectedMode, selectedType);
      } else {
        const infoTabId =
          visibleFeatureTabs.find((tab) => normalizeFeatureName(String(tab.nom || '')).includes('information'))?.id
          || selectedFeatureTabId
          || visibleFeatureTabs[0]?.id
          || null;
        await createFeatureWithContext({
          nom: 'Sous-type',
          mode_bien: selectedMode,
          type_bien: selectedType,
          type_caracteristique: 'choix_multiple',
          choix: [nextChoice],
          unite: null,
          icon_name: null,
          onglet_id: infoTabId,
          visibilite_client: 1,
        }, { skipExistingCheck: true });
      }
      handleStep2SousTypeChange(nextChoice);
      setNewSousTypeChoice('');
      toast.success('Sous-type ajoute');
    } catch {
      toast.error("Impossible d'ajouter le sous-type");
    } finally {
      setIsSavingSousTypeChoice(false);
    }
  };
  const handleDeleteSousTypeChoice = async () => {
    const selectedValue = String(step2SousTypeSelectedValue || '').trim();
    if (!selectedValue) return toast.error('Selectionnez un sous-type');
    const currentOptions = Array.from(new Set(step2SousTypeOptions.map((item) => String(item || '').trim()).filter(Boolean)));
    const nextChoices = currentOptions.filter((item) => item !== selectedValue);
    if (nextChoices.length === 0) {
      return toast.error('Impossible de supprimer le dernier sous-type');
    }
    if (!step2SousTypeFeature?.id) {
      return toast.error('Variable sous-type introuvable');
    }
    setIsDeletingSousTypeChoice(true);
    try {
      const featureId = String(step2SousTypeFeature.id || '').trim();
      const draft = featureDrafts[featureId];
      const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
      const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
      const featureApiBases = getFeatureApiBases();
      let response: Response | null = null;
      for (const base of featureApiBases) {
        const next = await fetch(`${base}/${encodeURIComponent(featureId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode_bien: selectedMode,
            type_bien: selectedType,
            apply_to_all: true,
            nom: String(draft?.nom || step2SousTypeFeature.nom || 'Sous-type').trim(),
            type_caracteristique: 'choix_multiple',
            choix: nextChoices,
            unite: null,
            icon_name: draft?.icon_name || step2SousTypeFeature.icon_name || null,
            onglet_id: draft?.onglet_id || step2SousTypeFeature.onglet_id || null,
            visibilite_client: draft?.visibilite_client ?? (Number(step2SousTypeFeature.visibilite_client) === 0 ? 0 : 1),
          }),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) throw new Error('update feature sous-type');
      await loadAvailableFeatures(selectedMode, selectedType);
      handleStep2SousTypeChange('');
      toast.success('Sous-type supprime');
    } catch {
      toast.error("Impossible de supprimer le sous-type");
    } finally {
      setIsDeletingSousTypeChoice(false);
    }
  };
  const handleImportSousTypes = async () => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const sourceMode = sousTypeImportMode;
    const sourceType = normalizeLegacyType(sousTypeImportType);
    if (sourceMode === selectedMode && sourceType === selectedType) {
      return toast.error('Choisissez un mode/type source different');
    }
    setIsImportingSousTypes(true);
    try {
      const featureApiBases = getFeatureApiBases();
      let sourceResponse: Response | null = null;
      for (const base of featureApiBases) {
        const next = await fetch(`${base}?mode_bien=${encodeURIComponent(sourceMode)}&type_bien=${encodeURIComponent(sourceType)}`);
        sourceResponse = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!sourceResponse || !sourceResponse.ok) throw new Error('load source');
      const sourceRows = await sourceResponse.json();
      const sourceFeature = (Array.isArray(sourceRows) ? sourceRows : []).find((feature) => {
        const featureType = normalizeFeatureType(feature?.type_caracteristique);
        if (featureType !== 'choix_multiple' && featureType !== 'plusieurs_choix') return false;
        const normalizedName = normalizeFeatureName(String(feature?.nom || '').replace(/[^a-z0-9]+/gi, ' '));
        return normalizedName === 'sous type'
          || normalizedName.includes('sous type')
          || normalizedName.startsWith('configuration');
      });
      const sourceChoices = sourceFeature ? parseFeatureChoices(stringifyFeatureChoices(sourceFeature.choix_json)) : [];
      if (sourceChoices.length === 0) {
        return toast.error('Aucun sous-type a importer');
      }
      const mergedChoices = Array.from(new Set([
        ...step2SousTypeOptions.map((item) => String(item || '').trim()).filter(Boolean),
        ...sourceChoices.map((item) => String(item || '').trim()).filter(Boolean),
      ]));
      const targetChoice = String(step2SousTypeSelectedValue || '').trim();
      if (!step2SousTypeFeature?.id) {
        const infoTabId =
          visibleFeatureTabs.find((tab) => normalizeFeatureName(String(tab.nom || '')).includes('information'))?.id
          || selectedFeatureTabId
          || visibleFeatureTabs[0]?.id
          || null;
        await createFeatureWithContext({
          nom: 'Sous-type',
          mode_bien: selectedMode,
          type_bien: selectedType,
          type_caracteristique: 'choix_multiple',
          choix: mergedChoices,
          unite: null,
          icon_name: null,
          onglet_id: infoTabId,
          visibilite_client: 1,
        }, { skipExistingCheck: true });
      } else {
        const featureId = String(step2SousTypeFeature.id || '').trim();
        const draft = featureDrafts[featureId];
        let updateResponse: Response | null = null;
        for (const base of featureApiBases) {
          const next = await fetch(`${base}/${encodeURIComponent(featureId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode_bien: selectedMode,
              type_bien: selectedType,
              apply_to_all: true,
              nom: String(draft?.nom || step2SousTypeFeature.nom || 'Sous-type').trim(),
              type_caracteristique: 'choix_multiple',
              choix: mergedChoices,
              unite: null,
              icon_name: draft?.icon_name || step2SousTypeFeature.icon_name || null,
              onglet_id: draft?.onglet_id || step2SousTypeFeature.onglet_id || null,
              visibilite_client: draft?.visibilite_client ?? (Number(step2SousTypeFeature.visibilite_client) === 0 ? 0 : 1),
            }),
          });
          updateResponse = next;
          if (next.ok || next.status !== 404) break;
        }
        if (!updateResponse || !updateResponse.ok) throw new Error('update target');
      }
      await loadAvailableFeatures(selectedMode, selectedType);
      if (targetChoice) handleStep2SousTypeChange(targetChoice);
      toast.success(`Sous-types importes: ${sourceChoices.length}`);
    } catch {
      toast.error("Impossible d'importer les sous-types");
    } finally {
      setIsImportingSousTypes(false);
    }
  };
  useEffect(() => {
    const featureId = String(step2SousTypeFeature?.id || '').trim();
    if (!featureId) return;
    const selectedFromFeature = String((featureChoiceValuesById[featureId] || [])[0] || '').trim();
    const selectedFromForm = String(formData.configuration || '').trim();
    if (!selectedFromForm && selectedFromFeature) {
      setFormData((prev) => ({ ...prev, configuration: selectedFromFeature }));
      return;
    }
    if (selectedFromForm && selectedFromForm !== selectedFromFeature) {
      setFeatureChoiceValuesById((prev) => ({ ...prev, [featureId]: [selectedFromForm] }));
    }
    if (selectedFromForm && !selectedFeatureIds.includes(featureId)) {
      setFeatureSelected(featureId, true);
    }
  }, [featureChoiceValuesById, formData.configuration, selectedFeatureIds, step2SousTypeFeature]);
  const preferredDetailTabId =
    detailTabsWithFeatures.find((tab) => normalizeFeatureName(String(tab.label || '')).includes('information'))?.id
    || detailTabsWithFeatures.find((tab) => normalizeFeatureName(String(tab.label || '')).includes('caracteristique'))?.id
    || detailTabsWithFeatures[0]?.id
    || detailTabsForRender.find((tab) => normalizeFeatureName(String(tab.label || '')).includes('information'))?.id
    || detailTabsForRender.find((tab) => normalizeFeatureName(String(tab.label || '')).includes('caracteristique'))?.id
    || detailTabsForRender[0]?.id
    || 'informations_generales';
  const setFeatureSelected = (featureId: string, checked: boolean) => {
    setSelectedFeatureIds((prev) => {
      if (checked) return prev.includes(featureId) ? prev : [...prev, featureId];
      return prev.filter((id) => id !== featureId);
    });
  };
  const getFeatureChoicesWithDefaults = (feature: Caracteristique) => {
    const baseChoices = parseFeatureChoices(stringifyFeatureChoices(feature.choix_json));
    const normalizedFeatureName = normalizeFeatureName(String(feature.nom || '').replace(/[^a-z0-9]+/gi, ' '));
    if (!normalizedFeatureName.includes('exterieur') && !normalizedFeatureName.includes('jardin')) {
      return baseChoices;
    }
    const requiredChoices = ['Piscine', 'Gazon', 'Jardin partage'];
    const existingTokens = new Set(baseChoices.map((choice) => normalizeFeatureName(choice)));
    const missing = requiredChoices.filter((choice) => !existingTokens.has(normalizeFeatureName(choice)));
    return [...baseChoices, ...missing];
  };
  const renderFeatureControl = (feature: Caracteristique, keyPrefix: string) => {
    const featureType = normalizeFeatureType(feature.type_caracteristique);
    const featureId = String(feature.id || '');
    const deleteButton = (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void handleRemoveFeature(feature);
        }}
        disabled={featureSaving}
        className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Supprimer
      </button>
    );
    if (featureType === 'choix_multiple') {
      const options = getFeatureChoicesWithDefaults(feature);
      const selectedValue = (featureChoiceValuesById[featureId] || [])[0] || '';
      return (
        <div key={`${keyPrefix}-${featureId}`} className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-sm font-medium text-gray-700">{feature.nom}</label>
            {deleteButton}
          </div>
          <select
            value={selectedValue}
            onChange={(e) => {
              const nextValue = String(e.target.value || '').trim();
              setFeatureChoiceValuesById((prev) => ({ ...prev, [featureId]: nextValue ? [nextValue] : [] }));
              setFeatureSelected(featureId, nextValue.length > 0);
            }}
            className="block w-full rounded-lg border-gray-300 border p-2.5 text-sm bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">-- Choisir --</option>
            {options.map((option) => <option key={`${featureId}-${option}`} value={option}>{option}</option>)}
          </select>
        </div>
      );
    }
    if (featureType === 'plusieurs_choix') {
      const options = getFeatureChoicesWithDefaults(feature);
      const selectedValues = featureChoiceValuesById[featureId] || [];
      const pickerValue = featureMultiChoicePickerById[featureId] || '';
      return (
        <div key={`${keyPrefix}-${featureId}`} className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="block text-sm font-medium text-gray-700">{feature.nom}</label>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Multi-selection</span>
            </div>
            {deleteButton}
          </div>
          <select
            value={pickerValue}
            onChange={(e) => {
              const nextValue = String(e.target.value || '').trim();
              setFeatureMultiChoicePickerById((prev) => ({ ...prev, [featureId]: '' }));
              if (!nextValue) return;
              setFeatureChoiceValuesById((prev) => {
                const current = Array.isArray(prev[featureId]) ? prev[featureId] : [];
                const next = current.includes(nextValue) ? current : [...current, nextValue];
                setFeatureSelected(featureId, next.length > 0);
                return { ...prev, [featureId]: next };
              });
            }}
            className="block w-full rounded-lg border-gray-300 border p-2.5 text-sm bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">-- Ajouter un choix --</option>
            {options.map((option) => <option key={`${featureId}-${option}`} value={option}>{option}</option>)}
          </select>
          <div className="mt-2 min-h-8 rounded-lg border border-dashed border-gray-200 bg-gray-50/70 p-2">
            {selectedValues.length === 0 && (
              <p className="text-xs text-gray-500">Aucun choix selectionne.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {selectedValues.map((option) => (
                <span key={`${featureId}-selected-${option}`} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                  <span>{option}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFeatureChoiceValuesById((prev) => {
                        const current = Array.isArray(prev[featureId]) ? prev[featureId] : [];
                        const next = current.filter((item) => item !== option);
                        setFeatureSelected(featureId, next.length > 0);
                        return { ...prev, [featureId]: next };
                      });
                    }}
                    className="rounded-full px-1 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900"
                    aria-label={`Retirer ${option}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    }
    if (featureType === 'valeur') {
      const unit = String(feature.unite || '').trim();
      const currentValue = String(featureValueById[featureId] || '');
      return (
        <div key={`${keyPrefix}-${featureId}`} className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-sm font-medium text-gray-700">{feature.nom}{unit ? ` (${unit})` : ''}</label>
            {deleteButton}
          </div>
          <input
            type="number"
            step="0.01"
            min={0}
            value={currentValue}
            onChange={(e) => {
              const nextValue = String(e.target.value || '');
              setFeatureValueById((prev) => ({ ...prev, [featureId]: nextValue }));
              setFeatureSelected(featureId, String(nextValue).trim().length > 0);
            }}
            className="block w-full rounded-lg border-gray-300 border p-2.5 text-sm bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      );
    }
    if (featureType === 'texte') {
      const currentValue = String(featureValueById[featureId] || '');
      return (
        <div key={`${keyPrefix}-${featureId}`} className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-sm font-medium text-gray-700">{feature.nom}</label>
            {deleteButton}
          </div>
          <input
            type="text"
            placeholder="Saisir une valeur..."
            value={currentValue}
            onChange={(e) => {
              const nextValue = String(e.target.value || '');
              setFeatureValueById((prev) => ({ ...prev, [featureId]: nextValue }));
              setFeatureSelected(featureId, String(nextValue).trim().length > 0);
            }}
            className="block w-full rounded-lg border-gray-300 border p-2.5 text-sm bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      );
    }
    const isChecked = selectedFeatureIds.includes(featureId);
    return (
      <div key={`${keyPrefix}-${featureId}`} className={`rounded-xl border px-3 py-3 shadow-sm transition-colors ${isChecked ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-200 bg-white hover:border-emerald-200'}`}>
        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-3">
            <span className="text-sm font-medium text-gray-700">{feature.nom}</span>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => setFeatureSelected(featureId, e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600"
            />
          </label>
          {deleteButton}
        </div>
      </div>
    );
  };
  const renderTerrainTabFeatures = () => (
    <div className="mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {terrainTabFeatures.map((feature) => renderFeatureControl(feature, 'terrain-tab'))}
        {terrainTabFeatures.length === 0 && <span className="text-xs text-gray-500">Aucune caracteristique dans cet onglet</span>}
      </div>
    </div>
  );
  const renderDetailTabFeatures = () => (
    <div className="mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {detailTabFeatures.map((feature) => renderFeatureControl(feature, 'detail-tab'))}
        {detailTabFeatures.length === 0 && <span className="text-xs text-gray-500">Aucune caracteristique dans cet onglet</span>}
      </div>
    </div>
  );
  useEffect(() => {
    if (!isTerrainVente) return;
    const hasTab = terrainTabsForRender.some((tab) => tab.id === terrainSectionTab);
    if (!hasTab) setTerrainSectionTab(terrainTabsForRender[0]?.id || '');
  }, [isTerrainVente, terrainSectionTab, terrainTabsForRender]);
  useEffect(() => {
    if (isTerrainVente) return;
    const hasTab = detailTabsForRender.some((tab) => tab.id === detailSectionTabId);
    if (!hasTab) {
      setDetailSectionTabId(preferredDetailTabId);
    }
  }, [isTerrainVente, detailSectionTabId, detailTabsForRender, preferredDetailTabId]);
  useEffect(() => {
    if (!selectedFeatureTabId) return;
    const hasTab = visibleFeatureTabs.some((tab) => tab.id === selectedFeatureTabId);
    if (!hasTab) {
      setSelectedFeatureTabId(visibleFeatureTabs[0]?.id || '');
    }
  }, [selectedFeatureTabId, visibleFeatureTabs]);
  const activeDetailTabLabel = normalizeFeatureName(String(detailTabsForRender.find((tab) => tab.id === detailSectionTabId)?.label || ''));
  const isInfoDetailTab = activeDetailTabLabel.includes('information');
  const isCharacteristicsDetailTab = activeDetailTabLabel.includes('caracteristique');
  const isImmeubleAppartementsDetailTab = activeDetailTabLabel.includes('appartement');
  const isImmeubleGaragesDetailTab = activeDetailTabLabel.includes('garage');
  const isImmeubleLocauxDetailTab = activeDetailTabLabel.includes('local');
  const isLotissementTerrainsDetailTab = activeDetailTabLabel.includes('terrain');
  const isLocalisationDetailTab = activeDetailTabLabel.includes('localisation');
  const isLitsDetailTab = activeDetailTabLabel.includes('lits');
  const isCapaciteDetailTab = activeDetailTabLabel.includes('capacite') || activeDetailTabLabel.includes('configuration');
  const isConfortDetailTab = activeDetailTabLabel.includes('confort') || activeDetailTabLabel.includes('equipement');
  const isSecuriteDetailTab = activeDetailTabLabel.includes('securite') || activeDetailTabLabel.includes('reglement');
  const isConditionsDetailTab = activeDetailTabLabel.includes('condition');
  const detailSectionHeading = `Details ${typeLabels[normalizeLegacyType((formData.type || 'appartement') as BienType)] || 'Bien'} (${modeLabels[(formData.mode || 'location_saisonniere') as BienMode] || 'Location saisonniere'})`;
  const renderDetailTabsNavigation = () => (
    <div className="mb-4 flex items-center gap-1">
      <button
        type="button"
        onClick={() => detailTabsNavRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
        className="h-7 w-7 shrink-0 rounded-full border border-gray-200 bg-white text-gray-600 hover:border-emerald-300"
        aria-label="Onglets precedent"
      >
        <ChevronLeft className="mx-auto h-4 w-4" />
      </button>
      <div
        ref={detailTabsNavRef}
        className="flex-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max min-w-full gap-2 pr-2">
        {detailTabsForRender.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={(event) => {
              setDetailSectionTabId(section.id);
              if (showFeaturePanel) {
                const linkedFeatureTabId = resolveFeatureTabIdFromDetailTab(section.id);
                if (linkedFeatureTabId) setSelectedFeatureTabId(linkedFeatureTabId);
              }
              event.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
            className={`inline-flex whitespace-nowrap px-3 py-2 text-xs rounded-full border transition-colors ${detailSectionTabId === section.id ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300'}`}
          >
            {section.label}
          </button>
        ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => detailTabsNavRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
        className="h-7 w-7 shrink-0 rounded-full border border-gray-200 bg-white text-gray-600 hover:border-emerald-300"
        aria-label="Onglets suivants"
      >
        <ChevronRight className="mx-auto h-4 w-4" />
      </button>
    </div>
  );
  const immeubleClientImageUnits = [
    ...Array.from({ length: Math.max(0, Number(formData.immeuble_nb_appartements || 0)) }, (_, idx) => ({ unitKey: `appartement_${idx + 1}`, label: `Appartement ${idx + 1}` })),
    ...Array.from({ length: Math.max(0, Number(formData.immeuble_nb_garages || 0)) }, (_, idx) => ({ unitKey: `garage_${idx + 1}`, label: `Garage ${idx + 1}` })),
    ...Array.from({ length: Math.max(0, Number(formData.immeuble_nb_locaux_commerciaux || 0)) }, (_, idx) => ({ unitKey: `local_commercial_${idx + 1}`, label: `Local commercial ${idx + 1}` })),
  ];
  const lotissementClientImageUnits = Array.from({ length: Math.max(1, Number(formData.lotissement_nb_terrains || 1)) }, (_, idx) => ({ unitKey: `terrain_${idx + 1}`, label: `Terrain ${idx + 1}` }));
  const isModeVente = (formData.mode || 'location_saisonniere') === 'vente';
  const currentTarificationMethode = (formData.tarification_methode || 'avec_commission') as TarificationMethodeVente;
  const venteTarificationPreview = computeVenteTarification(formData);
  const currentModalitePaiementVente = (formData.modalite_paiement_vente || 'comptant') as ModalitePaiementVente;
  const ventePaiementPreview = computeVentePaiement(formData, venteTarificationPreview.prixFinal);
  const requiredPrimaryStep = isModeVente ? 5 : 4;
  const createValidationIssue = (step: 1 | 2 | 3 | 4 | 5, fieldName: string, label: string, message: string): ValidationIssue => ({
    step,
    fieldName,
    label,
    message,
  });
  const getStepValidationIssues = (step: 1 | 2 | 3 | 4 | 5): ValidationIssue[] => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType(formData.type as BienType);
    const allowedTypes = BIEN_TYPES_BY_MODE[selectedMode] || [];
    const tarificationMethode = (formData.tarification_methode || 'avec_commission') as TarificationMethodeVente;
    const venteTarification = computeVenteTarification(formData);
    const modalitePaiementVente = (formData.modalite_paiement_vente || 'comptant') as ModalitePaiementVente;
    const appartementVente = selectedMode === 'vente' && selectedType === 'appartement';
    const localCommercialVente = selectedMode === 'vente' && selectedType === 'local_commercial';
    const terrainVente = selectedMode === 'vente' && selectedType === 'terrain';
    const lotissementVente = selectedMode === 'vente' && selectedType === 'lotissement';
    const immeubleVente = selectedMode === 'vente' && selectedType === 'immeuble';
    const issues: ValidationIssue[] = [];

    if (step === 1) {
      if (!String(formData.titre || '').trim()) issues.push(createValidationIssue(1, 'titre', 'Titre', 'Titre obligatoire'));
      if (!String(formData.reference || '').trim()) issues.push(createValidationIssue(1, 'reference', 'Reference interne', 'Reference obligatoire'));
      if (!selectedMode) issues.push(createValidationIssue(1, 'mode', 'Mode', 'Mode obligatoire'));
    }

    if (step === 2) {
      if (!selectedType || !allowedTypes.includes(selectedType)) {
        issues.push(createValidationIssue(2, 'type', 'Type', 'Type invalide pour ce mode'));
      }
      if (selectedMode !== 'vente') {
        const sousTypeFeature = availableFeatures.find((feature) => {
          const featureType = normalizeFeatureType(feature.type_caracteristique);
          if (featureType !== 'choix_multiple' && featureType !== 'plusieurs_choix') return false;
          const normalizedName = normalizeFeatureName(String(feature.nom || '').replace(/[^a-z0-9]+/gi, ' '));
          return normalizedName === 'sous type'
            || normalizedName.includes('sous type')
            || normalizedName.startsWith('configuration');
        });
        const sousTypeChoices = sousTypeFeature ? parseFeatureChoices(stringifyFeatureChoices(sousTypeFeature.choix_json)) : [];
        if (sousTypeChoices.length > 0 && !String(formData.configuration || '').trim()) {
          issues.push(createValidationIssue(2, 'configuration', 'Sous-type', 'Sous-type obligatoire'));
        }
      }
    }

    if (step === 3) {
      if (appartementVente && !formData.type_rue) issues.push(createValidationIssue(3, 'type_rue', 'Type de rue', 'Type de rue obligatoire pour Appartement en vente'));
      if (appartementVente && !formData.type_papier) issues.push(createValidationIssue(3, 'type_papier', 'Type de papier', 'Type de papier obligatoire pour Appartement en vente'));
      if (appartementVente && !String(formData.configuration || '').trim()) issues.push(createValidationIssue(3, 'configuration', 'Configuration', 'Configuration obligatoire pour Appartement en vente'));
      if (localCommercialVente && !String(formData.activite_recommandee || '').trim()) issues.push(createValidationIssue(3, 'activite_recommandee', 'Activite recommandee', 'Activite recommandee obligatoire pour Local commercial en vente'));
      if (localCommercialVente && !formData.type_rue) issues.push(createValidationIssue(3, 'type_rue', 'Type de rue', 'Type de rue obligatoire pour Local commercial en vente'));
      if (localCommercialVente && !formData.type_papier) issues.push(createValidationIssue(3, 'type_papier', 'Type de papier', 'Type de papier obligatoire pour Local commercial en vente'));
      if (terrainVente && !formData.type_terrain) issues.push(createValidationIssue(3, 'type_terrain', 'Type de terrain', 'Type de terrain obligatoire pour Terrain en vente'));
      if (terrainVente && (!formData.terrain_surface_m2 || Number(formData.terrain_surface_m2) <= 0)) issues.push(createValidationIssue(3, 'terrain_surface_m2', 'Surface terrain', 'Surface terrain obligatoire (> 0)'));
      if (terrainVente && (formData.terrain_mode_affichage_prix === 'm2_uniquement' || formData.terrain_mode_affichage_prix === 'total_et_m2') && (!formData.terrain_prix_affiche_par_m2 || Number(formData.terrain_prix_affiche_par_m2) <= 0)) issues.push(createValidationIssue(3, 'terrain_prix_affiche_par_m2', 'Prix affiche par m2', 'Prix affiche par m2 obligatoire (> 0)'));
      if (terrainVente && !formData.type_rue) issues.push(createValidationIssue(3, 'type_rue', 'Type de rue', 'Type de rue obligatoire pour Terrain en vente'));
      if (terrainVente && !formData.type_papier) issues.push(createValidationIssue(3, 'type_papier', 'Type de papier', 'Type de papier obligatoire pour Terrain en vente'));
      if (immeubleVente && !formData.type_rue) issues.push(createValidationIssue(3, 'type_rue', 'Type de rue', 'Type de rue obligatoire pour Immeuble en vente'));
      if (immeubleVente && !formData.type_papier) issues.push(createValidationIssue(3, 'type_papier', 'Type de papier', 'Type de papier obligatoire pour Immeuble en vente'));
      if (lotissementVente && (!formData.lotissement_nb_terrains || Number(formData.lotissement_nb_terrains) <= 0)) issues.push(createValidationIssue(3, 'lotissement_nb_terrains', 'Nombre de terrains', 'Nombre de terrains obligatoire pour le lotissement'));
      if (lotissementVente && (formData.lotissement_mode_prix_m2 || 'm2_unique') === 'm2_unique' && (!formData.lotissement_prix_m2_unique || Number(formData.lotissement_prix_m2_unique) <= 0)) issues.push(createValidationIssue(3, 'lotissement_prix_m2_unique', 'Prix m2 unique', 'Prix m2 unique obligatoire pour le lotissement'));
      if (lotissementVente && formData.lotissement_mode_prix_m2 === 'paliers' && (!Array.isArray(formData.lotissement_paliers_prix_m2) || formData.lotissement_paliers_prix_m2.length === 0)) issues.push(createValidationIssue(3, 'lotissement_mode_prix_m2', 'Paliers prix m2', 'Ajoutez au moins un palier de prix m2'));
      if (selectedMode === 'location_saisonniere') {
        const minStay = Number(saisonConfig.duree_min_sejour_nuits || 0);
        const maxStay = Number(saisonConfig.duree_max_sejour_nuits || 0);
        const maxGuests = Number(saisonConfig.limite_personnes_nuit || 0);
        const maxAdults = Number(saisonConfig.max_adultes || 0);
        const maxChildren = Number(saisonConfig.max_enfants ?? -1);
        if (!Number.isFinite(minStay) || minStay <= 0) issues.push(createValidationIssue(3, 'duree_min_sejour_nuits', 'Duree min sejour', 'La duree minimum doit etre > 0'));
        if (!Number.isFinite(maxStay) || maxStay <= 0 || maxStay < minStay) issues.push(createValidationIssue(3, 'duree_max_sejour_nuits', 'Duree max sejour', 'La duree max doit etre >= duree min'));
        if (!Number.isFinite(maxGuests) || maxGuests <= 0) issues.push(createValidationIssue(3, 'limite_personnes_nuit', 'Voyageurs max', 'Le nombre max de voyageurs doit etre > 0'));
        if (!Number.isFinite(maxAdults) || maxAdults <= 0) issues.push(createValidationIssue(3, 'max_adultes', 'Adultes max', 'Le nombre max adultes doit etre > 0'));
        if (!Number.isFinite(maxChildren) || maxChildren < 0) issues.push(createValidationIssue(3, 'max_enfants', 'Enfants max', 'Le nombre max enfants doit etre >= 0'));
      }
    }

    if (step === 4 && selectedMode === 'vente') {
      const prixAfficheClient = Number(formData.prix_affiche_client ?? formData.prix_nuitee ?? 0);
      const terrainPrixDerive = terrainVente
        ? Number(formData.terrain_prix_affiche_total || 0) || (Number(formData.terrain_surface_m2 || 0) * Number(formData.terrain_prix_affiche_par_m2 || 0))
        : 0;
      const lotissementPrixDerive = lotissementVente ? Number(formData.lotissement_prix_total || 0) : 0;
      const prixValideVente = (terrainVente || lotissementVente)
        ? (prixAfficheClient > 0 || terrainPrixDerive > 0 || lotissementPrixDerive > 0)
        : (prixAfficheClient > 0);
      if (!prixValideVente) issues.push(createValidationIssue(4, 'prix_affiche_client', 'Prix affiche client', 'Prix affiche client obligatoire et > 0 (ou prix terrain/lotissement)'));
      if (tarificationMethode === 'sans_commission') {
        const prixFixeProprietaire = Number(formData.prix_fixe_proprietaire ?? 0);
        const maxReduction = Number(formData.montant_max_reduction_negociation ?? 0);
        if (!Number.isFinite(prixFixeProprietaire) || prixFixeProprietaire <= 0) issues.push(createValidationIssue(4, 'prix_fixe_proprietaire', 'Prix fixe proprietaire', 'Prix fixe proprietaire obligatoire et > 0'));
        if (prixFixeProprietaire > prixAfficheClient) issues.push(createValidationIssue(4, 'prix_fixe_proprietaire', 'Prix fixe proprietaire', 'Prix fixe proprietaire ne peut pas depasser le prix affiche client'));
        if (maxReduction < 0 || maxReduction > venteTarification.revenuAgence) issues.push(createValidationIssue(4, 'montant_max_reduction_negociation', 'Montant max a diminuer', 'Montant max de reduction invalide'));
      }
    }

    if (step === 5 && selectedMode === 'vente' && modalitePaiementVente === 'facilite') {
      const pourcentagePromesse = Number(formData.pourcentage_premiere_partie_promesse ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE);
      const nombreTranches = Math.floor(Number(formData.nombre_tranches ?? 0));
      const periodeMois = Math.floor(Number(formData.periode_tranches_mois ?? 0));
      if (pourcentagePromesse <= 0 || pourcentagePromesse >= 100) issues.push(createValidationIssue(5, 'pourcentage_premiere_partie_promesse', 'Pourcentage 1ere partie', 'Le pourcentage de promesse doit etre > 0 et < 100'));
      if (nombreTranches <= 0) issues.push(createValidationIssue(5, 'nombre_tranches', 'Nombre de tranches', 'Le nombre de tranches doit etre > 0'));
      if (periodeMois <= 0) issues.push(createValidationIssue(5, 'periode_tranches_mois', 'Periode totale', 'La periode (mois) doit etre > 0'));
    }

    return issues;
  };

  const ensureFeatureTabsForCurrentContext = async (keys: Array<keyof BienUiConfig>) => {
    const selectedMode = (formData.mode || 'location_saisonniere') as BienMode;
    const selectedType = normalizeLegacyType((formData.type || 'appartement') as BienType);
    const definitions = keys
      .map((key) => UI_SECTION_FEATURE_TAB_DEFINITIONS[key])
      .filter((definition): definition is { label: string; ordre: number } => Boolean(definition));
    if (definitions.length === 0) return;

    let knownTabs = featureTabs.length > 0 ? [...featureTabs] : await loadFeatureTabs(selectedMode, selectedType);
    const tabApiBases = getFeatureTabApiBases();
    let createdAny = false;

    for (const definition of definitions) {
      const existing = knownTabs.find((tab) => normalizeTabNameForMatch(String(tab.nom || '')) === normalizeTabNameForMatch(definition.label));
      if (existing) continue;

      let response: Response | null = null;
      for (const base of tabApiBases) {
        const next = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode_bien: selectedMode,
            type_bien: selectedType,
            nom: definition.label,
            ordre: definition.ordre,
          }),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      if (!response || !response.ok) continue;
      const createdTab = await response.json();
      if (createdTab?.id) {
        knownTabs = [...knownTabs, createdTab];
        createdAny = true;
      }
    }

    if (createdAny) {
      await loadFeatureTabs(selectedMode, selectedType);
    }
  };
  const handleDeleteSelectedZone = async () => {
    const zoneId = String(formData.zone_id || '').trim();
    if (!zoneId) return toast.error('Aucune zone sÃ©lectionnÃ©e');
    const sourceZone = zonesOptions.find((item) => item.id === zoneId);
    const fallbackTarget = zonesOptions.find((item) => item.id !== zoneId)?.id || '';
    try {
      setZoneDeleteDialog({
        open: true,
        sourceId: zoneId,
        sourceLabel: sourceZone?.nom || zoneId,
        linkedBiens: [],
        targetId: fallbackTarget,
        loading: true,
        submitting: false,
      });
      const response = await fetch(`${API_URL}/zones/${encodeURIComponent(zoneId)}/linked-biens`);
      const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : [];
      if (!response.ok) throw new Error(payload?.error || 'Chargement des biens liÃ©s impossible');
      setZoneDeleteDialog((prev) => ({
        ...prev,
        linkedBiens: Array.isArray(payload) ? payload : [],
        loading: false,
      }));
    } catch (error) {
      setZoneDeleteDialog((prev) => ({ ...prev, open: false, loading: false }));
      const message = error instanceof Error ? error.message : 'Erreur suppression zone';
      toast.error(message);
    }
  };
  const handleDeleteSelectedProprietaire = async () => {
    const ownerId = String(formData.proprietaire_id || '').trim();
    if (!ownerId) return toast.error('Aucun propriÃ©taire sÃ©lectionnÃ©');
    const sourceOwner = proprietaireOptions.find((item) => item.id === ownerId);
    const fallbackTarget = proprietaireOptions.find((item) => item.id !== ownerId)?.id || '';
    try {
      setOwnerDeleteDialog({
        open: true,
        sourceId: ownerId,
        sourceLabel: sourceOwner?.nom || ownerId,
        linkedBiens: [],
        targetId: fallbackTarget,
        loading: true,
        submitting: false,
      });
      const response = await fetch(`${API_URL}/proprietaires/${encodeURIComponent(ownerId)}/linked-biens`, {
        credentials: 'include',
      });
      const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : [];
      if (!response.ok) throw new Error(payload?.error || 'Chargement des biens liÃ©s impossible');
      setOwnerDeleteDialog((prev) => ({
        ...prev,
        linkedBiens: Array.isArray(payload) ? payload : [],
        loading: false,
      }));
    } catch (error) {
      setOwnerDeleteDialog((prev) => ({ ...prev, open: false, loading: false }));
      const message = error instanceof Error ? error.message : 'Erreur suppression propriÃ©taire';
      toast.error(message);
    }
  };
  const handleConfirmDeleteZone = async () => {
    if (!zoneDeleteDialog.sourceId) return;
    if (zoneDeleteDialog.linkedBiens.length > 0 && !zoneDeleteDialog.targetId) {
      toast.error('SÃ©lectionnez une zone cible pour rÃ©affecter les biens');
      return;
    }
    try {
      setZoneDeleteDialog((prev) => ({ ...prev, submitting: true }));
      const response = await fetch(`${API_URL}/zones/${encodeURIComponent(zoneDeleteDialog.sourceId)}/reassign-and-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_zone_id: zoneDeleteDialog.targetId || null }),
      });
      const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
      if (!response.ok) throw new Error(payload?.error || 'Suppression zone impossible');
      const nextZones = zonesOptions.filter((item) => item.id !== zoneDeleteDialog.sourceId);
      setZonesOptions(nextZones);
      setFormData((prev) => {
        const currentZoneId = String(prev.zone_id || '');
        if (currentZoneId !== zoneDeleteDialog.sourceId) return prev;
        return { ...prev, zone_id: zoneDeleteDialog.targetId || nextZones[0]?.id || '' };
      });
      setZoneDeleteDialog((prev) => ({ ...prev, open: false, submitting: false }));
      toast.success('Zone supprimÃ©e');
    } catch (error) {
      setZoneDeleteDialog((prev) => ({ ...prev, submitting: false }));
      const message = error instanceof Error ? error.message : 'Erreur suppression zone';
      toast.error(message);
    }
  };
  const handleConfirmDeleteProprietaire = async () => {
    if (!ownerDeleteDialog.sourceId) return;
    if (ownerDeleteDialog.linkedBiens.length > 0 && !ownerDeleteDialog.targetId) {
      toast.error('SÃ©lectionnez un propriÃ©taire cible pour rÃ©affecter les biens');
      return;
    }
    try {
      setOwnerDeleteDialog((prev) => ({ ...prev, submitting: true }));
      const response = await fetch(`${API_URL}/proprietaires/${encodeURIComponent(ownerDeleteDialog.sourceId)}/reassign-and-delete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_proprietaire_id: ownerDeleteDialog.targetId || null }),
      });
      const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
      if (!response.ok) throw new Error(payload?.error || 'Suppression propriÃ©taire impossible');
      const nextOwners = proprietaireOptions.filter((item) => item.id !== ownerDeleteDialog.sourceId);
      setProprietaireOptions(nextOwners);
      setFormData((prev) => {
        const currentOwnerId = String(prev.proprietaire_id || '');
        if (currentOwnerId !== ownerDeleteDialog.sourceId) return prev;
        return { ...prev, proprietaire_id: ownerDeleteDialog.targetId || nextOwners[0]?.id || '' };
      });
      setOwnerDeleteDialog((prev) => ({ ...prev, open: false, submitting: false }));
      toast.success('PropriÃ©taire supprimÃ©');
    } catch (error) {
      setOwnerDeleteDialog((prev) => ({ ...prev, submitting: false }));
      const message = error instanceof Error ? error.message : 'Erreur suppression propriÃ©taire';
      toast.error(message);
    }
  };

  const handleUiSectionVisibilityChange = (key: keyof BienUiConfig, checked: boolean) => {
    setUiSectionVisible(key, checked);
    if (!checked) return;
    void ensureFeatureTabsForCurrentContext([key]);
  };
  const canAddFeature =
    String(newFeature || '').trim().length > 0
    && String(selectedFeatureTabId || '').trim().length > 0
    && visibleFeatureTabs.some((tab) => tab.id === selectedFeatureTabId)
    && (
      newFeatureType === 'simple'
      || newFeatureType === 'texte'
      || (newFeatureType === 'valeur' && String(newFeatureUnit || '').trim().length > 0)
      || ((newFeatureType === 'choix_multiple' || newFeatureType === 'plusieurs_choix') && parseFeatureChoices(newFeatureChoices).length > 0)
    );
  const openValidationDialog = (issues: ValidationIssue[]) => {
    if (issues.length === 0) return;
    setActiveTab('general');
    setGeneralStep(issues[0].step);
    setValidationDialogState({ open: true, issues });
    toast.error(issues.length === 1 ? issues[0].message : 'Des champs obligatoires sont manquants');
  };
  const focusValidationIssue = (issue: ValidationIssue) => {
    setActiveTab('general');
    setGeneralStep(issue.step);
    setValidationDialogState({ open: false, issues: [] });
    window.setTimeout(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[name="${issue.fieldName}"], #${issue.fieldName}, [data-field="${issue.fieldName}"]`));
      const target = candidates.find((element) => element.offsetParent !== null) || candidates[0];
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus();
    }, 180);
  };
  const validateStepBeforeContinue = (step: 1 | 2 | 3 | 4 | 5, nextStep?: 1 | 2 | 3 | 4 | 5) => {
    const issues = getStepValidationIssues(step);
    if (issues.length > 0) {
      openValidationDialog(issues);
      return;
    }
    markStepValidated(step);
    if (nextStep) {
      setValidationDialogState({ open: false, issues: [] });
      setGeneralStep(nextStep);
      return;
    }
    setValidationDialogState({ open: false, issues: [] });
    setActiveTab('images');
    toast.success(`Etape ${step} validee`);
  };
  const markStepValidated = (step: number) => {
    setValidatedSteps((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  };
  const isStepUnlocked = (targetStep: number) => {
    if (targetStep <= 1) return true;
    for (let step = 1; step < targetStep; step += 1) {
      if (!validatedSteps.has(step)) return false;
    }
    return true;
  };
  const goToStep = (targetStep: 1 | 2 | 3 | 4 | 5) => {
    if (targetStep > 1) {
      for (let step = 1 as 1 | 2 | 3 | 4 | 5; step < targetStep; step += 1) {
        const issues = getStepValidationIssues(step);
        if (issues.length > 0) {
          openValidationDialog(issues);
          return;
        }
      }
    }
    if (!isStepUnlocked(targetStep)) {
      toast.error("Validez d'abord les etapes precedentes");
      return;
    }
    setGeneralStep(targetStep);
  };
  const canAccessSecondaryTabs = isStepUnlocked(requiredPrimaryStep) && validatedSteps.has(requiredPrimaryStep);

  return (
    <form id="bien-editor-form" onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 bg-gray-50 px-4 shrink-0 overflow-x-auto">
        <button type="button" onClick={() => setActiveTab('general')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'general' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}><Home className="h-4 w-4 inline mr-2" />Informations</button>
        <button type="button" disabled={!canAccessSecondaryTabs} onClick={() => setActiveTab('images')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'images' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'} ${!canAccessSecondaryTabs ? 'opacity-50 cursor-not-allowed' : ''}`}><ImageIcon className="h-4 w-4 inline mr-2" />Images ({clientVisibleImages.length})</button>
        {!isModeVente && <button type="button" disabled={!canAccessSecondaryTabs} onClick={() => setActiveTab('calendar')} className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === 'calendar' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'} ${!canAccessSecondaryTabs ? 'opacity-50 cursor-not-allowed' : ''}`}><CalendarIcon className="h-4 w-4 inline mr-2" />Calendrier</button>}
      </div>
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {activeTab === 'general' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`grid gap-2 text-xs sm:text-sm ${isModeVente ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4'}`}>
                <button type="button" onClick={() => goToStep(1)} className={`min-h-11 px-3 py-2 rounded-lg border leading-tight text-left ${generalStep === 1 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'}`}>Etape 1: Base</button>
                <button type="button" disabled={!isStepUnlocked(2)} onClick={() => goToStep(2)} className={`min-h-11 px-3 py-2 rounded-lg border leading-tight text-left ${generalStep === 2 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${!isStepUnlocked(2) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 2: Type</button>
                <button type="button" disabled={!isStepUnlocked(3)} onClick={() => goToStep(3)} className={`min-h-11 px-3 py-2 rounded-lg border leading-tight text-left ${generalStep === 3 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${!isStepUnlocked(3) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 3: Details</button>
                <button type="button" disabled={!isStepUnlocked(4)} onClick={() => goToStep(4)} className={`min-h-11 px-3 py-2 rounded-lg border leading-tight text-left ${generalStep === 4 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${!isStepUnlocked(4) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 4: Tarification</button>
                {isModeVente && (
                  <button type="button" disabled={!isStepUnlocked(5)} onClick={() => goToStep(5)} className={`min-h-11 px-3 py-2 rounded-lg border leading-tight text-left ${generalStep === 5 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'} ${!isStepUnlocked(5) ? 'opacity-50 cursor-not-allowed' : ''}`}>Etape 5: Paiement</button>
                )}
              </div>
            </div>
            {generalStep === 1 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Home className="h-5 w-5 inline text-emerald-600 mr-2" />Etape 1 - Informations de base</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label><input required name="titre" value={formData.titre || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference interne *</label>
                  <div className="flex gap-2">
                    <input required name="reference" value={formData.reference || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    <button type="button" title={isReferenceManuallyEdited ? 'Revenir a la reference automatique' : 'Generer automatiquement la reference'} onClick={() => { setIsReferenceManuallyEdited(false); setFormData(prev => ({ ...prev, reference: generateReference() })); }} className="px-3 py-2 rounded-lg border border-gray-300 text-xs">Auto</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom dans l'application proprietaire</label>
                  <input
                    name="nom_bien_mobile"
                    value={formData.nom_bien_mobile || ''}
                    onChange={handleChange}
                    className="block w-full rounded-lg border-gray-300 border p-2"
                    placeholder="Ex: Villa Royale Kelibia"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Ce nom est reserve a l'affichage du bien dans l'application mobile proprietaire.
                  </p>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Mode *</label><select name="mode" value={formData.mode || 'location_saisonniere'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Localisation (Zone)</label>
                  <select name="zone_id" value={formData.zone_id || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{zonesOptions.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}</select>
                  {String(formData.zone_id || '').trim() && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-2">
                      {(() => {
                        const selectedZone = zonesOptions.find((zone) => zone.id === formData.zone_id);
                        const selectedZoneImageRaw =
                          selectedZoneImageTarget === 'pays'
                            ? selectedZone?.pays_image_url
                            : selectedZoneImageTarget === 'gouvernerat'
                              ? selectedZone?.gouvernerat_image_url
                              : selectedZoneImageTarget === 'region'
                                ? selectedZone?.region_image_url
                                : selectedZone?.quartier_image_url;
                        const selectedZoneImage = resolveMediaUrl(selectedZoneImageRaw || '');
                        return (
                          <>
                            {selectedZoneImage && (
                              <img src={selectedZoneImage} alt={selectedZone?.nom || 'Zone'} className="h-24 w-full rounded-lg border border-gray-200 object-cover" />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ''; }}
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                setSelectedZoneImageFile(file);
                                if (file) {
                                  setSelectedZoneImagePreview(URL.createObjectURL(file));
                                } else {
                                  setSelectedZoneImagePreview('');
                                }
                              }}
                              className="block w-full rounded-lg border-gray-300 border p-2 text-xs"
                            />
                            {selectedZoneImageFile && (
                              <p className="text-[11px] text-emerald-700">Fichier selectionne: {selectedZoneImageFile.name}</p>
                            )}
                            <div className="space-y-1">
                              <label className="text-[11px] text-gray-600">Appliquer cette image a</label>
                              <select
                                value={selectedZoneImageTarget}
                                onChange={(e) => setSelectedZoneImageTarget(e.target.value as 'quartier' | 'region' | 'gouvernerat' | 'pays')}
                                className="block w-full rounded-lg border-gray-300 border p-2 text-xs"
                              >
                                <option value="pays">Pays courant (ex: Tunisie)</option>
                                <option value="gouvernerat">Gouvernorat courant (ex: Nabeul)</option>
                                <option value="region">Region courante</option>
                                <option value="quartier">Quartier / Zone courante</option>
                              </select>
                            </div>
                            {selectedZoneImagePreview && (
                              <img src={selectedZoneImagePreview} alt="Apercu nouvelle zone" className="h-20 w-full rounded-lg border border-dashed border-emerald-300 object-cover" />
                            )}
                            <button type="button" disabled={selectedZoneImageUploading || !selectedZoneImageFile} onClick={handleUpdateSelectedZoneImage} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs disabled:opacity-60">
                              {selectedZoneImageUploading ? 'Upload...' : 'Mettre a jour photo zone'}
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setShowAddZone(!showAddZone)} className="text-xs text-emerald-700 hover:underline">+ Ajouter une zone</button>
                    <button type="button" onClick={handleDeleteSelectedZone} className="text-xs text-red-600 hover:underline">Supprimer zone sÃ©lectionnÃ©e</button>
                  </div>
                  {showAddZone && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <input type="text" list="zone-pays-options" value={newZonePays} onChange={(e) => { setNewZonePays(e.target.value); setNewZoneGouvernerat(''); setNewZoneRegion(''); setNewZoneQuartier(''); }} placeholder="Pays" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <datalist id="zone-pays-options">
                        {paysOptions.map((item) => <option key={`pays-${item}`} value={item} />)}
                      </datalist>
                      <input type="text" list="zone-gouvernerat-options" disabled={!newZonePays.trim()} value={newZoneGouvernerat} onChange={(e) => { setNewZoneGouvernerat(e.target.value); setNewZoneRegion(''); setNewZoneQuartier(''); }} placeholder="Gouvernerat" className="block w-full rounded-lg border-gray-300 border p-2 text-sm disabled:bg-gray-100 disabled:text-gray-400" />
                      <datalist id="zone-gouvernerat-options">
                        {gouverneratOptions.map((item) => <option key={`gouv-${item}`} value={item} />)}
                      </datalist>
                      <input type="text" list="zone-region-options" disabled={!newZonePays.trim() || !newZoneGouvernerat.trim()} value={newZoneRegion} onChange={(e) => { setNewZoneRegion(e.target.value); setNewZoneQuartier(''); }} placeholder="Region" className="block w-full rounded-lg border-gray-300 border p-2 text-sm disabled:bg-gray-100 disabled:text-gray-400" />
                      <datalist id="zone-region-options">
                        {regionOptions.map((item) => <option key={`region-${item}`} value={item} />)}
                      </datalist>
                      <input type="text" list="zone-quartier-options" disabled={!newZonePays.trim() || !newZoneGouvernerat.trim() || !newZoneRegion.trim()} value={newZoneQuartier} onChange={(e) => setNewZoneQuartier(e.target.value)} placeholder="Zone/Quartier" className="block w-full rounded-lg border-gray-300 border p-2 text-sm disabled:bg-gray-100 disabled:text-gray-400" />
                      <datalist id="zone-quartier-options">
                        {quartierOptions.map((item) => <option key={`quartier-${item}`} value={item} />)}
                      </datalist>
                      <input type="url" value={newZoneGoogleMapsUrl} onChange={(e) => setNewZoneGoogleMapsUrl(e.target.value)} placeholder="Lien Google Maps (optionnel)" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-gray-600">Image de la zone (popup client)</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setNewZoneImageFile(file);
                            if (file) {
                              setNewZoneImagePreview(URL.createObjectURL(file));
                            } else {
                              setNewZoneImagePreview('');
                            }
                          }}
                          className="block w-full rounded-lg border-gray-300 border p-2 text-xs"
                        />
                        {newZoneImagePreview && (
                          <img src={newZoneImagePreview} alt="AperÃ§u zone" className="h-24 w-full rounded-lg border border-gray-200 object-cover" />
                        )}
                      </div>
                      <button type="button" disabled={newZoneImageUploading} onClick={handleAddZone} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-60">
                        {newZoneImageUploading ? 'Upload image...' : 'Enregistrer zone'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Propriétaire</label>
                  <select name="proprietaire_id" value={formData.proprietaire_id || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                    <option value="">-- Choisir un propriétaire --</option>
                    {proprietaireOptions.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setShowAddProprietaire(!showAddProprietaire)} className="text-xs text-emerald-700 hover:underline">+ Ajouter un propriétaire</button>
                    <button type="button" onClick={handleDeleteSelectedProprietaire} className="text-xs text-red-600 hover:underline">Supprimer propriétaire sélectionné</button>
                  </div>
                  {showAddProprietaire && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <input type="text" value={newOwnerFirstName} onChange={(e) => setNewOwnerFirstName(e.target.value)} placeholder="Prénom" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="text" value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)} placeholder="Nom" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="text" value={newOwnerPhone} onChange={(e) => setNewOwnerPhone(e.target.value)} placeholder="Téléphone" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="email" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} placeholder="Email (optionnel)" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <input type="text" value={newOwnerCin} onChange={(e) => setNewOwnerCin(e.target.value)} placeholder="CIN (optionnel)" className="block w-full rounded-lg border-gray-300 border p-2 text-sm" />
                      <button type="button" onClick={handleAddProprietaire} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm">Enregistrer propriétaire</button>
                    </div>
                  )}
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Nom propriétaire</label><input value={selectedProprietaire?.nom || ''} readOnly className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Numéro propriétaire</label><input value={selectedProprietaire?.telephone || ''} readOnly className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea name="description" value={formData.description || ''} onChange={handleChange} rows={4} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
              <div className="flex justify-end"><button type="button" onClick={() => validateStepBeforeContinue(1, 2)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 2</button></div>
            </div>}
            {generalStep === 2 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold"><Maximize className="h-5 w-5 inline text-emerald-600 mr-2" />Etape 2 - Type de bien</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Type *</label><select name="type" value={formData.type || 'appartement'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">{(BIEN_TYPES_BY_MODE[(formData.mode || 'location_saisonniere') as BienMode] || []).map((typeValue) => <option key={typeValue} value={typeValue}>{typeLabels[typeValue]}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Statut</label><select name="statut" value={formData.statut || 'disponible'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="disponible">Disponible</option><option value="loue">LouÃ©</option><option value="reserve">RÃ©servÃ©</option><option value="maintenance">Maintenance</option><option value="bloque">BloquÃ©</option></select></div>
                {isLocationAppartement && (
                  <div data-field="configuration">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sous-type *</label>
                    <select
                      name="configuration"
                      value={step2SousTypeSelectedValue}
                      onChange={(e) => handleStep2SousTypeChange(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 border p-2"
                    >
                      <option value="">-- Choisir --</option>
                      {step2SousTypeOptions.map((option) => (
                        <option key={`step2-sous-type-${option}`} value={option}>{option}</option>
                      ))}
                    </select>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={newSousTypeChoice}
                        onChange={(e) => setNewSousTypeChoice(e.target.value)}
                        placeholder="Nouveau choix (ex: S+5)"
                        className="block w-full rounded-lg border-gray-300 border p-2"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddSousTypeChoice()}
                        disabled={isSavingSousTypeChoice}
                        className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        + Ajouter un choix
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <select
                        value={sousTypeImportMode}
                        onChange={(e) => setSousTypeImportMode(e.target.value as BienMode)}
                        className="rounded-lg border-gray-300 border p-2 text-xs"
                      >
                        {Object.entries(modeLabels).map(([value, label]) => (
                          <option key={`import-mode-${value}`} value={value}>{label}</option>
                        ))}
                      </select>
                      <select
                        value={sousTypeImportType}
                        onChange={(e) => setSousTypeImportType(normalizeLegacyType(e.target.value as BienType))}
                        className="rounded-lg border-gray-300 border p-2 text-xs"
                      >
                        {(BIEN_TYPES_BY_MODE[sousTypeImportMode] || []).map((typeValue) => (
                          <option key={`import-type-${typeValue}`} value={typeValue}>{typeLabels[typeValue]}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleImportSousTypes()}
                        disabled={isImportingSousTypes}
                        className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                      >
                        Importer des sous-types
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSousTypeChoice()}
                        disabled={isDeletingSousTypeChoice || !String(step2SousTypeSelectedValue || '').trim()}
                        className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        Supprimer ce sous-type
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Valeurs de la variable Sous-type (crÃ©Ã©e dans Informations gÃ©nÃ©rales).
                    </p>
                  </div>
                )}
              </div>
              <label htmlFor="visible_sur_site" className="flex items-center justify-between gap-3 p-3 rounded-lg border border-emerald-100 bg-emerald-50/60 cursor-pointer">
                <div>
                  <span className="block text-sm font-medium text-gray-800">Visible sur le site</span>
                  <span className="block text-xs text-gray-500">Si dÃ©sactivÃ©, le bien reste en admin mais n'apparait plus cÃ´tÃ© client.</span>
                </div>
                <span className="relative inline-flex items-center">
                  <input type="checkbox" id="visible_sur_site" name="visible_sur_site" checked={formData.visible_sur_site !== false} onChange={handleCheckboxChange} className="peer sr-only" />
                  <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-emerald-600" />
                  <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                </span>
              </label>
              <label htmlFor="is_featured" className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-100 bg-amber-50/60 cursor-pointer">
                <div>
                  <span className="block text-sm font-medium text-gray-800">Bien en vedette</span>
                  <span className="block text-xs text-gray-500">Si activÃ©, le bien apparait dans les listes vedette cÃ´tÃ© client.</span>
                </div>
                <span className="relative inline-flex items-center">
                  <input type="checkbox" id="is_featured" name="is_featured" checked={formData.is_featured === true} onChange={handleCheckboxChange} className="peer sr-only" />
                  <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-amber-500" />
                  <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                </span>
              </label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Visibilite des composants UI</h4>
                  <p className="text-xs text-gray-500">Ces reglages controlent quels blocs apparaissent sur la page client et dans l'aperÃ§u admin.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {uiSectionOptions.map((section) => (
                    <label key={section.key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <span className="text-sm text-gray-700">{section.label}</span>
                      <span className="relative inline-flex items-center">
                        <input type="checkbox" checked={isUiSectionVisible(section.key)} onChange={(e) => handleUiSectionVisibilityChange(section.key, e.target.checked)} className="peer sr-only" />
                        <span className="h-5 w-10 rounded-full bg-gray-300 transition-colors peer-checked:bg-emerald-600" />
                        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                      </span>
                    </label>
                  ))}
                  {isImmeubleVente && <>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <span className="text-sm text-gray-700">Bloc appartements</span>
                      <span className="relative inline-flex items-center">
                        <input type="checkbox" checked={isUiSectionVisible('show_immeuble_appartements')} onChange={(e) => handleUiSectionVisibilityChange('show_immeuble_appartements', e.target.checked)} className="peer sr-only" />
                        <span className="h-5 w-10 rounded-full bg-gray-300 transition-colors peer-checked:bg-emerald-600" />
                        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                      </span>
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <span className="text-sm text-gray-700">Bloc garages</span>
                      <span className="relative inline-flex items-center">
                        <input type="checkbox" checked={isUiSectionVisible('show_immeuble_garages')} onChange={(e) => handleUiSectionVisibilityChange('show_immeuble_garages', e.target.checked)} className="peer sr-only" />
                        <span className="h-5 w-10 rounded-full bg-gray-300 transition-colors peer-checked:bg-emerald-600" />
                        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                      </span>
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <span className="text-sm text-gray-700">Bloc locaux commerciaux</span>
                      <span className="relative inline-flex items-center">
                        <input type="checkbox" checked={isUiSectionVisible('show_immeuble_locaux_commerciaux')} onChange={(e) => handleUiSectionVisibilityChange('show_immeuble_locaux_commerciaux', e.target.checked)} className="peer sr-only" />
                        <span className="h-5 w-10 rounded-full bg-gray-300 transition-colors peer-checked:bg-emerald-600" />
                        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                      </span>
                    </label>
                  </>}
                  {isLotissementVente && <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <span className="text-sm text-gray-700">Bloc terrains du lotissement</span>
                    <span className="relative inline-flex items-center">
                      <input type="checkbox" checked={isUiSectionVisible('show_lotissement_terrains')} onChange={(e) => handleUiSectionVisibilityChange('show_lotissement_terrains', e.target.checked)} className="peer sr-only" />
                      <span className="h-5 w-10 rounded-full bg-gray-300 transition-colors peer-checked:bg-emerald-600" />
                      <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                    </span>
                  </label>}
                </div>
                {isTerrainVente && terrainTabsForRender.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <h5 className="text-sm font-semibold text-gray-800">Onglets terrain visibles</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {terrainTabsForRender.map((tab) => (
                        <label key={`ui-tab-${tab.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                          <span className="text-sm text-gray-700">{tab.label}</span>
                          <span className="relative inline-flex items-center">
                            <input type="checkbox" checked={uiConfig.terrain_tabs?.[tab.id] !== false} onChange={(e) => setTerrainTabVisible(tab.id, e.target.checked)} className="peer sr-only" />
                            <span className="h-5 w-10 rounded-full bg-gray-300 transition-colors peer-checked:bg-emerald-600" />
                            <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-between">
                <button type="button" onClick={() => goToStep(1)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                <button type="button" onClick={() => validateStepBeforeContinue(2, 3)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 3</button>
              </div>
            </div>}
            {generalStep === 3 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold"><Maximize className="h-5 w-5 inline text-emerald-600 mr-2" />Etape 3 - Caracteristiques</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowFeaturePanel((prev) => {
                      const next = !prev;
                      if (next) {
                        const linkedFeatureTabId = resolveFeatureTabIdFromDetailTab(detailSectionTabId);
                        if (linkedFeatureTabId) {
                          setSelectedFeatureTabId(linkedFeatureTabId);
                        } else if (!selectedFeatureTabId && visibleFeatureTabs[0]?.id) {
                          setSelectedFeatureTabId(visibleFeatureTabs[0].id);
                        }
                      }
                      return next;
                    });
                  }}
                  className="px-3 py-1.5 text-xs sm:text-sm rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  Gerer caracteristiques
                </button>
              </div>
              <p className="text-sm text-gray-500">Les caracteristiques sont selectionnees et affichees directement dans les onglets de details ci-dessous.</p>
              {showFeaturePanel && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <select value={selectedFeatureTabId} onChange={(e) => setSelectedFeatureTabId(e.target.value)} className="rounded-lg border-gray-300 border p-2 text-sm">
                      <option value="">-- Choisir onglet --</option>
                      {visibleFeatureTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.nom}</option>)}
                    </select>
                    <input type="text" value={newFeatureTabName} onChange={(e) => setNewFeatureTabName(e.target.value)} placeholder="Ajouter un onglet (nom)" className="rounded-lg border-gray-300 border p-2 text-sm" />
                    <button type="button" onClick={() => void handleCreateFeatureTab()} disabled={featureSaving} className="px-3 py-2 bg-white border border-emerald-300 text-emerald-700 rounded-lg text-sm disabled:opacity-60">Ajouter onglet</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {visibleFeatureTabs.map((tab) => (
                      <span key={tab.id} className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border ${(selectedFeatureTabId === tab.id) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-emerald-200 text-emerald-700'}`}>
                        <button type="button" onClick={() => setSelectedFeatureTabId(tab.id)}>{tab.nom}</button>
                        <button type="button" onClick={() => void handleDeleteFeatureTab(tab)} className={`${selectedFeatureTabId === tab.id ? 'text-white' : 'text-red-500'}`}>x</button>
                      </span>
                    ))}
                    {visibleFeatureTabs.length === 0 && <span className="text-xs text-gray-500">Aucun onglet disponible</span>}
                  </div>
                  <div className="space-y-2">
                    {visibleFeatureTabs.map((tab) => (
                      <div key={`edit-tab-${tab.id}`} className="grid grid-cols-1 md:grid-cols-4 gap-2 p-2 bg-white border border-emerald-200 rounded-lg">
                        <input
                          value={featureTabDrafts[tab.id] ?? tab.nom}
                          onChange={(e) => setFeatureTabDrafts((prev) => ({ ...prev, [tab.id]: e.target.value }))}
                          className="rounded-lg border-gray-300 border p-2 text-sm md:col-span-2"
                        />
                        <button type="button" onClick={() => setSelectedFeatureTabId(tab.id)} className="px-3 py-2 border border-emerald-300 text-emerald-700 rounded-lg text-sm">Selectionner</button>
                        <button type="button" onClick={() => { setSelectedFeatureTabId(tab.id); void handleUpdateFeatureTab(tab); }} disabled={featureSaving} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-60">Modifier onglet</button>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
                    <input type="text" value={newFeature} onChange={(e) => setNewFeature(e.target.value)} placeholder="Ex: Wifi, Vue mer, Clim centralisee" className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm" />
                    <select value={newFeatureType} onChange={(e) => setNewFeatureType(e.target.value as 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte')} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm">
                      <option value="simple">Simple (Oui/Non)</option>
                      <option value="choix_multiple">Choix unique (liste)</option>
                      <option value="plusieurs_choix">Plusieurs a la fois (multi-selection)</option>
                      <option value="valeur">Valeur</option>
                      <option value="texte">Texte</option>
                    </select>
                    <div className="min-w-0 flex items-center">
                      {renderFeatureIconPreview(newFeatureIconName, newFeature, {
                        onClick: () => setOpenFeatureIconPickerId((prev) => prev === 'new' ? null : 'new'),
                        expanded: openFeatureIconPickerId === 'new',
                      })}
                    </div>
                    <select value={newFeatureVisibilite} onChange={(e) => setNewFeatureVisibilite((Number(e.target.value) === 0 ? 0 : 1) as 0 | 1)} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm">
                      <option value={1}>Externe (client)</option>
                      <option value={0}>Interne (admin)</option>
                    </select>
                    <select value={selectedFeatureTabId} onChange={(e) => setSelectedFeatureTabId(e.target.value)} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm">
                      <option value="">-- Choisir onglet details --</option>
                      {visibleFeatureTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.nom}</option>)}
                    </select>
                    <button type="button" onClick={() => void handleAddFeature()} disabled={featureSaving || !canAddFeature} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-60">{featureSaving ? '...' : 'Ajouter'}</button>
                  </div>
                  {openFeatureIconPickerId === 'new' && renderFeatureIconPicker(newFeatureIconName, newFeature, setNewFeatureIconName)}
                  {(newFeatureType === 'choix_multiple' || newFeatureType === 'plusieurs_choix') && (
                    <input
                      type="text"
                      value={newFeatureChoices}
                      onChange={(e) => setNewFeatureChoices(e.target.value)}
                      placeholder="Choix separes par virgules: Wifi, Clim, Vue mer"
                      className="rounded-lg border-gray-300 border p-2 text-sm"
                    />
                  )}
                  {newFeatureType === 'valeur' && (
                    <input
                      type="text"
                      value={newFeatureUnit}
                      onChange={(e) => setNewFeatureUnit(e.target.value)}
                      placeholder="Unite (m2, m...)"
                      className="rounded-lg border-gray-300 border p-2 text-sm"
                    />
                  )}
                  {unassignedFeatures.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <div>
                        <h5 className="text-sm font-semibold text-amber-900">Caracteristiques sans onglet</h5>
                        <p className="text-xs text-amber-800">Associez chaque caracteristique a un onglet existant pour ce mode et type de bien.</p>
                      </div>
                      <div className="space-y-2">
                        {unassignedFeatures.map((feature) => {
                          const draft = featureDrafts[feature.id] || {
                            nom: feature.nom || '',
                            type_caracteristique: normalizeFeatureType(feature.type_caracteristique),
                            choix: stringifyFeatureChoices(feature.choix_json),
                            unite: feature.unite || '',
                            icon_name: feature.icon_name || '',
                            onglet_id: '',
                            visibilite_client: (Number(feature.visibilite_client) === 0 ? 0 : 1) as 0 | 1
                          };
                          return (
                            <div key={`unassigned-${feature.id}`} className="grid grid-cols-1 gap-2 rounded-lg border border-amber-200 bg-white p-2 sm:grid-cols-2 xl:grid-cols-6">
                              <input value={draft.nom} onChange={(e) => handleFeatureDraftChange(feature.id, { nom: e.target.value })} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm" />
                              <select value={draft.onglet_id} onChange={(e) => handleFeatureDraftChange(feature.id, { onglet_id: e.target.value })} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm">
                                <option value="">Choisir onglet</option>
                                {visibleFeatureTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.nom}</option>)}
                              </select>
                              <select value={draft.type_caracteristique} onChange={(e) => handleFeatureDraftChange(feature.id, { type_caracteristique: e.target.value as 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte' })} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm">
                                <option value="simple">Simple</option>
                                <option value="choix_multiple">Choix unique</option>
                                <option value="plusieurs_choix">Plusieurs a la fois</option>
                                <option value="valeur">Valeur</option>
                                <option value="texte">Texte</option>
                              </select>
                              <div className="min-w-0 flex items-center">
                                {renderFeatureIconPreview(draft.icon_name, draft.nom, {
                                  onClick: () => setOpenFeatureIconPickerId((prev) => prev === feature.id ? null : feature.id),
                                  expanded: openFeatureIconPickerId === feature.id,
                                })}
                              </div>
                              <input value={draft.type_caracteristique === 'choix_multiple' || draft.type_caracteristique === 'plusieurs_choix' ? draft.choix : draft.unite} onChange={(e) => handleFeatureDraftChange(feature.id, draft.type_caracteristique === 'choix_multiple' || draft.type_caracteristique === 'plusieurs_choix' ? { choix: e.target.value } : { unite: e.target.value })} placeholder={draft.type_caracteristique === 'choix_multiple' || draft.type_caracteristique === 'plusieurs_choix' ? 'Choix (si type choix)' : 'Unite (si valeur)'} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm" />
                              <button type="button" onClick={() => void handleUpdateFeature(feature)} disabled={featureSaving || !draft.onglet_id} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-60">Associer</button>
                              {openFeatureIconPickerId === feature.id && (
                                <div className="sm:col-span-2 xl:col-span-6">
                                  {renderFeatureIconPicker(draft.icon_name, draft.nom, (iconName) => handleFeatureDraftChange(feature.id, { icon_name: iconName }))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {visibleFeaturesForSelectedTab.map((feature) => {
                      const draft = featureDrafts[feature.id] || {
                        nom: feature.nom || '',
                        type_caracteristique: normalizeFeatureType(feature.type_caracteristique),
                        choix: stringifyFeatureChoices(feature.choix_json),
                        unite: feature.unite || '',
                        icon_name: feature.icon_name || '',
                        onglet_id: feature.onglet_id || '',
                        visibilite_client: (Number(feature.visibilite_client) === 0 ? 0 : 1) as 0 | 1
                      };
                      return (
                        <div key={feature.id} className="space-y-2 p-2 bg-white border border-emerald-200 rounded-lg">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                            <input value={draft.nom} onChange={(e) => handleFeatureDraftChange(feature.id, { nom: e.target.value })} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm" />
                            <select value={draft.type_caracteristique} onChange={(e) => handleFeatureDraftChange(feature.id, { type_caracteristique: e.target.value as 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte' })} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm">
                              <option value="simple">Simple</option>
                              <option value="choix_multiple">Choix unique</option>
                              <option value="plusieurs_choix">Plusieurs a la fois</option>
                              <option value="valeur">Valeur</option>
                              <option value="texte">Texte</option>
                            </select>
                            <select value={draft.visibilite_client} onChange={(e) => handleFeatureDraftChange(feature.id, { visibilite_client: (Number(e.target.value) === 0 ? 0 : 1) as 0 | 1 })} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm">
                              <option value={1}>Externe</option>
                              <option value={0}>Interne</option>
                            </select>
                            <select value={draft.onglet_id} onChange={(e) => handleFeatureDraftChange(feature.id, { onglet_id: e.target.value })} className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm">
                              {visibleFeatureTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.nom}</option>)}
                            </select>
                          </div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                            <div className="min-w-0 flex items-center">
                              {renderFeatureIconPreview(draft.icon_name, draft.nom, {
                                onClick: () => setOpenFeatureIconPickerId((prev) => prev === feature.id ? null : feature.id),
                                expanded: openFeatureIconPickerId === feature.id,
                              })}
                            </div>
                            <input value={draft.choix} onChange={(e) => handleFeatureDraftChange(feature.id, { choix: e.target.value })} placeholder="Choix (si multiple)" className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm" />
                            <input value={draft.unite} onChange={(e) => handleFeatureDraftChange(feature.id, { unite: e.target.value })} placeholder="Unite (si type valeur)" className="min-w-0 rounded-lg border-gray-300 border p-2 text-sm" />
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <button type="button" onClick={() => void handleUpdateFeature(feature)} disabled={featureSaving} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-60">Modifier</button>
                            <button type="button" onClick={() => void handleUpdateFeatureWithScope(feature, true)} disabled={featureSaving} className="px-3 py-2 bg-white border border-emerald-300 text-emerald-700 rounded-lg text-sm disabled:opacity-60">Appliquer a tous</button>
                            <button type="button" onClick={() => void handleRemoveFeature(feature)} disabled={featureSaving} className="px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm disabled:opacity-60">Supprimer</button>
                          </div>
                          {openFeatureIconPickerId === feature.id && (
                            <div>
                              {renderFeatureIconPicker(draft.icon_name, draft.nom, (iconName) => handleFeatureDraftChange(feature.id, { icon_name: iconName }))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {visibleFeaturesForSelectedTab.length === 0 && <span className="text-xs text-gray-500">Aucune caracteristique dans cet onglet</span>}
                  </div>
                </div>
              )}
              {isAppartementVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">{detailSectionHeading}</h4>
                  {renderDetailTabsNavigation()}
                  {isInfoDetailTab && (
                    <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Superficie (mÂ²)</label>
                      <input type="number" min={0} step="0.01" name="superficie_m2" value={formData.superficie_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ã‰tage</label>
                      <input type="number" min={0} name="etage" value={formData.etage ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Configuration</label>
                      <input name="configuration" value={formData.configuration || ''} onChange={handleChange} placeholder="S+2, S+3..." className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de chambres</label>
                      <input type="number" min={0} name="nb_chambres" value={formData.nb_chambres ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de SDB</label>
                      <input type="number" min={0} name="nb_salle_bain" value={formData.nb_salle_bain ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">AnnÃ©e construction</label>
                      <input type="number" min={1800} max={3000} name="annee_construction" value={formData.annee_construction ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label>
                      <select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label>
                      <select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Distance plage (m)</label>
                      <input type="number" min={0} name="distance_plage_m" value={formData.distance_plage_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                  </div>
                  {renderTypeProofUploads()}
                  {renderDetailTabFeatures()}
                    </>
                  )}
                  {isCharacteristicsDetailTab && (
                    <>
                  {renderDetailTabFeatures()}
                    </>
                  )}
                  {!isInfoDetailTab && !isCharacteristicsDetailTab && renderDetailTabFeatures()}
                </div>
              )}
              {isLocalCommercialVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">{detailSectionHeading}</h4>
                  {renderDetailTabsNavigation()}
                  {isInfoDetailTab && (
                    <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Surface (mÂ²)</label>
                      <input type="number" min={0} step="0.01" name="surface_local_m2" value={formData.surface_local_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">FaÃ§ade (m)</label>
                      <input type="number" min={0} step="0.01" name="facade_m" value={formData.facade_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hauteur plafond (m)</label>
                      <input type="number" min={0} step="0.01" name="hauteur_plafond_m" value={formData.hauteur_plafond_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ActivitÃ© recommandÃ©e</label>
                      <input name="activite_recommandee" value={formData.activite_recommandee || ''} onChange={handleChange} placeholder="CafÃ©, boutique..." className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label>
                      <select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label>
                      <select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="">-- Choisir --</option>
                        {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                  {renderTypeProofUploads()}
                  {renderDetailTabFeatures()}
                    </>
                  )}
                  {isCharacteristicsDetailTab && (
                    <>
                  {renderDetailTabFeatures()}
                    </>
                  )}
                  {!isInfoDetailTab && !isCharacteristicsDetailTab && renderDetailTabFeatures()}
                </div>
              )}
              {isTerrainVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">DÃ©tails Terrain (Vente)</h4>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {terrainTabsForRender.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setTerrainSectionTab(section.id)}
                        className={`px-3 py-1.5 text-xs rounded-full border ${terrainSectionTab === section.id ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300'}`}
                      >
                        {section.label}
                      </button>
                    ))}
                  </div>

                  {terrainSectionTab === 'informations_generales' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type de terrain *</label>
                        <select name="type_terrain" value={formData.type_terrain || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {Object.entries(TYPE_TERRAIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
                        <input name="terrain_zone" value={formData.terrain_zone || ''} onChange={handleChange} placeholder="Urbaine / touristique..." className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label>
                        <select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label>
                        <select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        {renderTerrainMultiChoice('terrain_disponibilite_reseaux', 'Disponibilite reseaux', TERRAIN_MULTI_OPTIONS.disponibiliteReseaux)}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Hauteur de construction autorisee</label>
                        <select name="terrain_hauteur_construction_autorisee" value={formData.terrain_hauteur_construction_autorisee || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_HAUTEUR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mode affichage prix</label>
                        <select name="terrain_mode_affichage_prix" value={formData.terrain_mode_affichage_prix || 'total_et_m2'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          {Object.entries(TERRAIN_PRIX_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix affiche total (DT)</label>
                        <input type="number" min={0} step="0.01" name="terrain_prix_affiche_total" value={formData.terrain_prix_affiche_total ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix affiche / m2 (DT)</label>
                        <input type="number" min={0} step="0.01" name="terrain_prix_affiche_par_m2" value={formData.terrain_prix_affiche_par_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div className="md:col-span-2">
                        {renderTerrainTabFeatures()}
                      </div>
                    </div>
                  )}

                  {terrainSectionTab === 'dimensions_forme' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Surface (m2) *</label>
                        <input type="number" min={0} step="0.01" name="terrain_surface_m2" value={formData.terrain_surface_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Facade (m)</label>
                        <input type="number" min={0} step="0.01" name="terrain_facade_m" value={formData.terrain_facade_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Route d'acces (largeur en m)</label>
                        <input type="number" min={0} step="0.01" name="terrain_route_acces_largeur_m" value={formData.terrain_route_acces_largeur_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Forme</label>
                        <select name="terrain_forme" value={formData.terrain_forme || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_FORME_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Terrain plat / en pente</label>
                        <select name="terrain_topographie" value={formData.terrain_topographie || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_TOPOGRAPHIE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Distance plage (m)</label>
                        <input type="number" min={0} name="terrain_distance_plage_m" value={formData.terrain_distance_plage_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Terrain d'angle</label>
                        <select value={getBooleanSelectValue(formData.terrain_angle)} onChange={(e) => handleBooleanSelectChange('terrain_angle', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="oui">Oui</option>
                          <option value="non">Non</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        {renderTerrainTabFeatures()}
                      </div>
                    </div>
                  )}

                  {terrainSectionTab === 'situation_juridique' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Bornage</label>
                          <select value={getBooleanSelectValue(formData.terrain_bornage)} onChange={(e) => handleBooleanSelectChange('terrain_bornage', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Travaux autorises selon municipalite</label>
                          <select value={getBooleanSelectValue(formData.terrain_travaux_municipalite_autorises)} onChange={(e) => handleBooleanSelectChange('terrain_travaux_municipalite_autorises', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Limites cadastrales</label>
                          <select value={getBooleanSelectValue(formData.terrain_limites_cadastrales)} onChange={(e) => handleBooleanSelectChange('terrain_limites_cadastrales', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Si oui visualiser</label>
                          <select value={getBooleanSelectValue(formData.terrain_visualisation_limites_cadastrales)} onChange={(e) => handleBooleanSelectChange('terrain_visualisation_limites_cadastrales', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Constructible</label>
                          <select value={getBooleanSelectValue(formData.terrain_constructible)} onChange={(e) => handleBooleanSelectChange('terrain_constructible', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                      </div>
                      {renderTerrainTabFeatures()}
                    </div>
                  )}

                  {terrainSectionTab === 'acces_environnement' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Voisinage</label>
                        <select name="terrain_voisinage" value={formData.terrain_voisinage || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_VOISINAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        {renderTerrainMultiChoice('terrain_proximites_commodites', 'Proximite commodites', TERRAIN_MULTI_OPTIONS.proximites)}
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Autres proximites</label>
                        <input name="terrain_proximites_commodites_autres" value={formData.terrain_proximites_commodites_autres || ''} onChange={handleChange} placeholder="Hopital, clinique, etc." className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div className="md:col-span-2">
                        {renderTerrainTabFeatures()}
                      </div>
                    </div>
                  )}

                  {terrainSectionTab === 'viabilisation' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        {renderTerrainMultiChoice('terrain_viabilisation_eau_sources', 'Eau (sources)', TERRAIN_MULTI_OPTIONS.eauSources)}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Canalisation ONAS</label>
                        <select name="terrain_viabilisation_onas" value={formData.terrain_viabilisation_onas || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_ONAS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">STEG</label>
                        <select name="terrain_viabilisation_steg" value={formData.terrain_viabilisation_steg || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_STEG_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gaz de ville</label>
                        <select value={getBooleanSelectValue(formData.terrain_viabilisation_gaz_ville)} onChange={(e) => handleBooleanSelectChange('terrain_viabilisation_gaz_ville', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="oui">Oui</option>
                          <option value="non">Non</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fibre optique / internet</label>
                        <select value={getBooleanSelectValue(formData.terrain_viabilisation_fibre_optique)} onChange={(e) => handleBooleanSelectChange('terrain_viabilisation_fibre_optique', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="oui">Oui</option>
                          <option value="non">Non</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Telephone fixe</label>
                        <select value={getBooleanSelectValue(formData.terrain_viabilisation_telephone_fixe)} onChange={(e) => handleBooleanSelectChange('terrain_viabilisation_telephone_fixe', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="oui">Oui</option>
                          <option value="non">Non</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <h5 className="text-sm font-semibold text-gray-800 mb-2">Caracteristiques generales</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {TERRAIN_VENTE_BOOLEAN_FIELDS.slice(2).map((field) => (
                            <label key={field} className="inline-flex items-center gap-2 text-sm text-gray-700">
                              <input type="checkbox" name={field} checked={!!formData[field]} onChange={handleCheckboxChange} />
                              <span>{TERRAIN_VENTE_BOOLEAN_LABELS[field]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        {renderTerrainTabFeatures()}
                      </div>
                    </div>
                  )}

                  {terrainSectionTab === 'environnement_naturel' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type du sol</label>
                        <select name="terrain_type_sol" value={formData.terrain_type_sol || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_TYPE_SOL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vegetation</label>
                        <input name="terrain_vegetation" value={formData.terrain_vegetation || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Niveau sonore</label>
                        <select name="terrain_niveau_sonore" value={formData.terrain_niveau_sonore || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="">-- Choisir --</option>
                          {TERRAIN_NIVEAU_SONORE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Risque inondation</label>
                        <select value={getBooleanSelectValue(formData.terrain_risque_inondation)} onChange={(e) => handleBooleanSelectChange('terrain_risque_inondation', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2">
                          <option value="oui">Oui</option>
                          <option value="non">Non</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Exposition au vent</label>
                        <input name="terrain_exposition_vent" value={formData.terrain_exposition_vent || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div className="md:col-span-2">
                        {renderTerrainTabFeatures()}
                      </div>
                    </div>
                  )}

                  {terrainSectionTab === 'ideal_utilisation' && (
                    <div>
                      {renderTerrainMultiChoice('terrain_ideal_utilisations', 'Ideal pour', TERRAIN_MULTI_OPTIONS.idealUtilisations)}
                      {renderTerrainTabFeatures()}
                    </div>
                  )}

                  {terrainSectionTab === 'documents_disponibles' && (
                    <div>
                      {renderTerrainMultiChoice('terrain_documents_disponibles', 'Documents disponibles', TERRAIN_MULTI_OPTIONS.documents)}
                      {renderTypeProofUploads()}
                      {renderTerrainTabFeatures()}
                    </div>
                  )}
                  {!TERRAIN_SECTION_TABS.some((tab) => tab.id === terrainSectionTab) && (
                    <div>
                      {renderTerrainTabFeatures()}
                    </div>
                  )}
                </div>
              )}
              {isLotissementVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">{detailSectionHeading}</h4>
                  {renderDetailTabsNavigation()}
                  {isInfoDetailTab && (
                    <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de terrains *</label>
                      <input type="number" min={1} name="lotissement_nb_terrains" value={formData.lotissement_nb_terrains ?? 1} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prix total (DT)</label>
                      <input type="number" min={0} step="0.01" name="lotissement_prix_total" value={formData.lotissement_prix_total ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mode prix m2 *</label>
                      <select name="lotissement_mode_prix_m2" value={formData.lotissement_mode_prix_m2 || 'm2_unique'} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        {Object.entries(LOTISSEMENT_PRIX_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    {(formData.lotissement_mode_prix_m2 || 'm2_unique') === 'm2_unique' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix m2 unique (DT) *</label>
                        <input type="number" min={0} step="0.01" name="lotissement_prix_m2_unique" value={formData.lotissement_prix_m2_unique ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                    )}
                  </div>
                  {(formData.lotissement_mode_prix_m2 || 'm2_unique') === 'paliers' && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-semibold text-gray-800">Paliers prix m2</h5>
                        <button type="button" onClick={addLotissementPalier} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs">Ajouter palier</button>
                      </div>
                      {(formData.lotissement_paliers_prix_m2 || []).map((row, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <input type="number" min={1} placeholder="Min m2" value={row.min_m2 ?? ''} onChange={(e) => handleLotissementPalierChange(idx, 'min_m2', e.target.value)} className="rounded-lg border-gray-300 border p-2" />
                          <input type="number" min={1} placeholder="Max m2 (optionnel)" value={row.max_m2 ?? ''} onChange={(e) => handleLotissementPalierChange(idx, 'max_m2', e.target.value)} className="rounded-lg border-gray-300 border p-2" />
                          <input type="number" min={0} step="0.01" placeholder="Prix m2 (DT)" value={row.prix_m2 ?? ''} onChange={(e) => handleLotissementPalierChange(idx, 'prix_m2', e.target.value)} className="rounded-lg border-gray-300 border p-2" />
                          <button type="button" onClick={() => removeLotissementPalier(idx)} className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm">Supprimer</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {renderDetailTabFeatures()}
                    </>
                  )}
                  {isLotissementTerrainsDetailTab && (
                    <>
                  <div className="mt-4 space-y-2">
                    <h5 className="text-sm font-semibold text-gray-800">Terrains du lotissement</h5>
                    {(formData.lotissement_terrains || []).map((row, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 rounded-lg border border-gray-200 bg-white">
                        <input value={row.reference || generateChildReference('TRN', idx + 1)} readOnly className="rounded-lg border-gray-300 border p-2 bg-gray-50 text-xs font-semibold text-gray-700" />
                        <select value={row.type_terrain || ''} onChange={(e) => handleLotissementTerrainChange(idx, 'type_terrain', e.target.value)} className="rounded-lg border-gray-300 border p-2">
                          <option value="">Type terrain</option>
                          {Object.entries(TYPE_TERRAIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <input type="number" min={0} step="0.01" placeholder="Surface m2" value={row.surface_m2 ?? ''} onChange={(e) => handleLotissementTerrainChange(idx, 'surface_m2', e.target.value)} className="rounded-lg border-gray-300 border p-2" />
                        <select value={row.type_rue || ''} onChange={(e) => handleLotissementTerrainChange(idx, 'type_rue', e.target.value)} className="rounded-lg border-gray-300 border p-2">
                          <option value="">Type rue</option>
                          {Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <select value={row.type_papier || ''} onChange={(e) => handleLotissementTerrainChange(idx, 'type_papier', e.target.value)} className="rounded-lg border-gray-300 border p-2">
                          <option value="">Type papier</option>
                          {Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <input placeholder="Zone" value={row.terrain_zone || ''} onChange={(e) => handleLotissementTerrainChange(idx, 'terrain_zone', e.target.value)} className="rounded-lg border-gray-300 border p-2" />
                        <div className="md:col-span-5 mt-1 rounded-lg border border-dashed border-gray-300 p-2">
                          <div className="text-xs font-medium text-gray-700 mb-2">Preuves Terrain {idx + 1} (type rue / type papier)</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                                <Upload className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Preuve type de rue</span>
                              </label>
                              <input
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_RUE, e, `terrain_${idx + 1}`)}
                                disabled={uploading}
                                className="block w-full text-xs"
                              />
                              <div className="mt-2 grid grid-cols-4 gap-2">
                                {getLotissementTerrainProofs(PROOF_MOTIF_TYPE_RUE, idx + 1).map((img) => (
                                  <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                                    <img src={resolveMediaUrl(img.url)} alt={`Preuve rue terrain ${idx + 1}`} className="w-full h-16 object-cover" />
                                    <button type="button" onClick={() => handleRemoveImage(img.id)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-full">
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                                <Upload className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Preuve type de papier</span>
                              </label>
                              <input
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_PAPIER, e, `terrain_${idx + 1}`)}
                                disabled={uploading}
                                className="block w-full text-xs"
                              />
                              <div className="mt-2 grid grid-cols-4 gap-2">
                                {getLotissementTerrainProofs(PROOF_MOTIF_TYPE_PAPIER, idx + 1).map((img) => (
                                  <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                                    <img src={resolveMediaUrl(img.url)} alt={`Preuve papier terrain ${idx + 1}`} className="w-full h-16 object-cover" />
                                    <button type="button" onClick={() => handleRemoveImage(img.id)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-full">
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {renderDetailTabFeatures()}
                    </>
                  )}
                  {!isInfoDetailTab && !isLotissementTerrainsDetailTab && renderDetailTabFeatures()}
                </div>
              )}
              {isImmeubleVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">{detailSectionHeading}</h4>
                  {renderDetailTabsNavigation()}
                  {isInfoDetailTab && (
                    <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Surface terrain (mÂ²)</label><input type="number" min={0} step="0.01" name="immeuble_surface_terrain_m2" value={formData.immeuble_surface_terrain_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Surface bÃ¢tie (mÂ²)</label><input type="number" min={0} step="0.01" name="immeuble_surface_batie_m2" value={formData.immeuble_surface_batie_m2 ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de niveaux</label><input type="number" min={0} name="immeuble_nb_niveaux" value={formData.immeuble_nb_niveaux ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de garages</label><input type="number" min={0} name="immeuble_nb_garages" value={formData.immeuble_nb_garages ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre d'appartements</label><input type="number" min={0} name="immeuble_nb_appartements" value={formData.immeuble_nb_appartements ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de locaux commerciaux</label><input type="number" min={0} name="immeuble_nb_locaux_commerciaux" value={formData.immeuble_nb_locaux_commerciaux ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Type de rue *</label><select name="type_rue" value={formData.type_rue || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="">-- Choisir --</option>{Object.entries(TYPE_RUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Type de papier *</label><select name="type_papier" value={formData.type_papier || ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2"><option value="">-- Choisir --</option>{Object.entries(TYPE_PAPIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Distance plage (m)</label><input type="number" min={0} name="immeuble_distance_plage_m" value={formData.immeuble_distance_plage_m ?? ''} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                  </div>
                  {renderDetailTabFeatures()}
                    </>
                  )}
                  {isImmeubleAppartementsDetailTab && (
                    <>
                  <div className="mt-4">
                    <h5 className="text-sm font-semibold text-gray-800 mb-2">Appartements de l'immeuble</h5>
                    <div className="space-y-2">
                      {(formData.immeuble_appartements || []).map((row, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 p-3 rounded-lg border border-gray-200 bg-white">
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - RÃ©fÃ©rence</label><input value={row.reference || generateChildReference('APT', idx + 1)} readOnly className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-xs font-semibold text-gray-700" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - Chambres</label><input type="number" min={0} value={row.chambres || 0} onChange={(e) => handleImmeubleAppartementChange(idx, 'chambres', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - SDB</label><input type="number" min={0} value={row.salle_bain || 0} onChange={(e) => handleImmeubleAppartementChange(idx, 'salle_bain', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - Surface (mÂ²)</label><input type="number" min={0} step="0.01" value={row.superficie_m2 ?? ''} onChange={(e) => handleImmeubleAppartementChange(idx, 'superficie_m2', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div><label className="block text-xs text-gray-600 mb-1">Appartement {idx + 1} - Configuration</label><input value={row.configuration || ''} onChange={(e) => handleImmeubleAppartementChange(idx, 'configuration', e.target.value)} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                          <div className="md:col-span-4 mt-1 rounded-lg border border-dashed border-gray-300 p-2">
                            <div className="text-xs font-medium text-gray-700 mb-2">Preuves Appartement {idx + 1} (type rue / type papier)</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                                  <Upload className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Preuve type de rue</span>
                                </label>
                                <input
                                  type="file"
                                  accept="image/*,.heic,.heif"
                                  multiple
                                  onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_RUE, e, `appartement_${idx + 1}`)}
                                  disabled={uploading}
                                  className="block w-full text-xs"
                                />
                                <div className="mt-2 grid grid-cols-4 gap-2">
                                  {getImmeubleAppartementProofs(PROOF_MOTIF_TYPE_RUE, idx + 1).map((img) => (
                                    <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                                      <img src={resolveMediaUrl(img.url)} alt={`Preuve rue appartement ${idx + 1}`} className="w-full h-16 object-cover" />
                                      <button type="button" onClick={() => handleRemoveImage(img.id)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-full">
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                                  <Upload className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Preuve type de papier</span>
                                </label>
                                <input
                                  type="file"
                                  accept="image/*,.heic,.heif"
                                  multiple
                                  onChange={(e) => handleProofFileUpload(PROOF_MOTIF_TYPE_PAPIER, e, `appartement_${idx + 1}`)}
                                  disabled={uploading}
                                  className="block w-full text-xs"
                                />
                                <div className="mt-2 grid grid-cols-4 gap-2">
                                  {getImmeubleAppartementProofs(PROOF_MOTIF_TYPE_PAPIER, idx + 1).map((img) => (
                                    <div key={img.id} className="relative rounded border border-gray-200 overflow-hidden">
                                      <img src={resolveMediaUrl(img.url)} alt={`Preuve papier appartement ${idx + 1}`} className="w-full h-16 object-cover" />
                                      <button type="button" onClick={() => handleRemoveImage(img.id)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-full">
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {(formData.immeuble_appartements || []).length === 0 && <span className="text-xs text-gray-500">Le nombre de lignes suit le champ "Nombre d'appartements".</span>}
                    </div>
                  </div>
                  {renderDetailTabFeatures()}
                    </>
                  )}
                  {isImmeubleGaragesDetailTab && (
                    <>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <h6 className="text-sm font-semibold text-gray-800 mb-2">RÃ©fÃ©rences garages</h6>
                      <div className="space-y-2">
                        {(formData.immeuble_garages || []).map((row, idx) => (
                          <input key={`garage-${idx}`} value={row.reference || generateChildReference('GAR', idx + 1)} readOnly className="w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-xs font-semibold text-gray-700" />
                        ))}
                        {(formData.immeuble_garages || []).length === 0 && <span className="text-xs text-gray-500">Aucun garage dÃ©fini.</span>}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <h6 className="text-sm font-semibold text-gray-800 mb-2">RÃ©fÃ©rences locaux commerciaux</h6>
                      <div className="space-y-2">
                        {(formData.immeuble_locaux_commerciaux || []).map((row, idx) => (
                          <input key={`local-${idx}`} value={row.reference || generateChildReference('LOC', idx + 1)} readOnly className="w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-xs font-semibold text-gray-700" />
                        ))}
                        {(formData.immeuble_locaux_commerciaux || []).length === 0 && <span className="text-xs text-gray-500">Aucun local commercial dÃ©fini.</span>}
                      </div>
                    </div>
                  </div>
                  {renderDetailTabFeatures()}
                    </>
                  )}
                  {isCharacteristicsDetailTab && (
                    <>
                  {renderDetailTabFeatures()}
                    </>
                  )}
                  {(isImmeubleLocauxDetailTab && !isImmeubleGaragesDetailTab) && renderDetailTabFeatures()}
                  {!isInfoDetailTab && !isCharacteristicsDetailTab && !isImmeubleAppartementsDetailTab && !isImmeubleGaragesDetailTab && !isImmeubleLocauxDetailTab && renderDetailTabFeatures()}
                </div>
              )}
              {!isAppartementVente && !isLocalCommercialVente && !isTerrainVente && !isLotissementVente && !isImmeubleVente && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">{detailSectionHeading}</h4>
                  {renderDetailTabsNavigation()}
                  {isInfoDetailTab && (
                    <>
                      {(formData.mode === 'location_saisonniere') && (
                        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 space-y-4">
                          <div className="rounded-lg border border-gray-200 bg-white p-3">
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.info_nb_chambres ? 'none' : undefined }}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-xs text-gray-600">Nombre de chambres global</label>
                                <button type="button" onClick={() => removeUiBlock('info_nb_chambres')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <input type="number" min={0} name="nb_chambres" value={formData.nb_chambres ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2 text-sm bg-white" />
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.info_nb_sdb ? 'none' : undefined }}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-xs text-gray-600">Nombre de SDB global</label>
                                <button type="button" onClick={() => removeUiBlock('info_nb_sdb')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <input type="number" min={0} name="nb_salle_bain" value={formData.nb_salle_bain ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2 text-sm bg-white" />
                            </div>
                          </div>
                        </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.info_categorie_standing ? 'none' : undefined }}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-xs text-gray-600">Categorie standing</label>
                                <button type="button" onClick={() => removeUiBlock('info_categorie_standing')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <select value={saisonConfig.categorie_standing || ''} onChange={(e) => updateSaisonConfig({ categorie_standing: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2"><option value="">--</option>{SAISON_STANDING_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.info_etage ? 'none' : undefined }}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-xs text-gray-600">Etage</label>
                                <button type="button" onClick={() => removeUiBlock('info_etage')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <select value={saisonConfig.etage || ''} onChange={(e) => updateSaisonConfig({ etage: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2"><option value="">--</option>{SAISON_ETAGE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.info_ascenseur ? 'none' : undefined }}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-xs text-gray-600">Ascenseur</label>
                                <button type="button" onClick={() => removeUiBlock('info_ascenseur')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <select value={saisonConfig.ascenseur ? 'oui' : 'non'} onChange={(e) => updateSaisonConfig({ ascenseur: e.target.value === 'oui' })} className="block w-full rounded-lg border-gray-300 border p-2"><option value="oui">Oui</option><option value="non">Non</option></select>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.info_vue ? 'none' : undefined }}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-xs text-gray-600">Vue</label>
                                <button type="button" onClick={() => removeUiBlock('info_vue')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <select value={saisonConfig.vue || ''} onChange={(e) => updateSaisonConfig({ vue: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2"><option value="">--</option>{SAISON_VUE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.info_niveau_sonore ? 'none' : undefined }}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-xs text-gray-600">Niveau sonore</label>
                                <button type="button" onClick={() => removeUiBlock('info_niveau_sonore')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <select value={saisonConfig.niveau_sonore || ''} onChange={(e) => updateSaisonConfig({ niveau_sonore: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2"><option value="">--</option>{SAISON_NIVEAU_SONORE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                            </div>
                          </div>
                          {renderDetailTabFeatures()}
                        </div>
                      )}
                      {(formData.mode !== 'location_saisonniere') && renderDetailTabFeatures()}
                    </>
                  )}
                  {!isInfoDetailTab && (formData.mode === 'location_saisonniere') && (
                    <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
                      {isLocalisationDetailTab && (
                        <div className="rounded-lg border border-gray-200 bg-white p-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.loc_zone_quartier ? 'none' : undefined }}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Zone / Quartier</span>
                                <button type="button" onClick={() => removeUiBlock('loc_zone_quartier')} className="rounded border border-red-300 px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <p className="font-semibold text-gray-900 mt-0.5">{selectedZone?.quartier || selectedZone?.nom || '-'}</p>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.loc_ville ? 'none' : undefined }}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Ville</span>
                                <button type="button" onClick={() => removeUiBlock('loc_ville')} className="rounded border border-red-300 px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <p className="font-semibold text-gray-900 mt-0.5">{selectedZone?.region || selectedZone?.nom || '-'}</p>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.loc_acces_general ? 'none' : undefined }}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-xs text-gray-600">Acces general</label>
                                <button type="button" onClick={() => removeUiBlock('loc_acces_general')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <select value={saisonConfig.acces_general || ''} onChange={(e) => updateSaisonConfig({ acces_general: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2">
                                <option value="">--</option>
                                {SAISON_ACCES_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.loc_maps_bien ? 'none' : undefined }}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-emerald-700 font-semibold">Lien Maps du bien (separe de la zone)</span>
                                <button type="button" onClick={() => removeUiBlock('loc_maps_bien')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <p className="text-gray-600 mt-1">Collez une URL embed Google Maps ou un iframe complet. Ce lien est prioritaire sur la zone.</p>
                              <input
                                type="text"
                                value={String(saisonConfig.google_maps_embed_url || '')}
                                onChange={(e) => updateSaisonConfig({ google_maps_embed_url: normalizeMapsInput(e.target.value) })}
                                placeholder="https://www.google.com/maps/embed?pb=..."
                                className="mt-2 block w-full rounded-lg border-gray-300 border p-2 text-sm bg-white"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      {isLitsDetailTab && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.lits_prix_matelas ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Prix matelas supplementaire (DT)</label>
                              <button type="button" onClick={() => removeUiBlock('lits_prix_matelas')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <input type="number" min={0} value={saisonConfig.matelas_supplementaire_prix ?? 25} onChange={(e) => updateSaisonConfig({ matelas_supplementaire_prix: Number(e.target.value || 0) })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white" />
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.lits_max_matelas ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Max matelas supplementaires</label>
                              <button type="button" onClick={() => removeUiBlock('lits_max_matelas')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <input type="number" min={0} value={saisonConfig.matelas_supplementaires_max ?? 0} onChange={(e) => updateSaisonConfig({ matelas_supplementaires_max: Number(e.target.value || 0) })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white" />
                          </div>
                        </div>
                      )}
                      {isCapaciteDetailTab && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
                            <label className="mb-1 block text-xs text-gray-600">Voyageurs max (total)</label>
                            <input
                              type="number"
                              min={1}
                              value={saisonConfig.limite_personnes_nuit ?? 1}
                              onChange={(e) => updateSaisonConfig({ limite_personnes_nuit: Math.max(1, Number(e.target.value || 1)) })}
                              className="block w-full rounded-lg border border-gray-300 p-2 bg-white"
                            />
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
                            <label className="mb-1 block text-xs text-gray-600">Adultes max ({'>'} 18 ans)</label>
                            <input
                              type="number"
                              min={1}
                              value={saisonConfig.max_adultes ?? 1}
                              onChange={(e) => updateSaisonConfig({ max_adultes: Math.max(1, Number(e.target.value || 1)) })}
                              className="block w-full rounded-lg border border-gray-300 p-2 bg-white"
                            />
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
                            <label className="mb-1 block text-xs text-gray-600">Enfants max (3 a 17 ans)</label>
                            <input
                              type="number"
                              min={0}
                              value={saisonConfig.max_enfants ?? 0}
                              onChange={(e) => updateSaisonConfig({ max_enfants: Math.max(0, Number(e.target.value || 0)) })}
                              className="block w-full rounded-lg border border-gray-300 p-2 bg-white"
                            />
                          </div>
                        </div>
                      )}
                      {isConfortDetailTab && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.confort_produits_gratuits ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Produits d'accueil gratuits</label>
                              <button type="button" onClick={() => removeUiBlock('confort_produits_gratuits')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <select value={saisonConfig.produits_accueil_gratuits ? 'oui' : 'non'} onChange={(e) => updateSaisonConfig({ produits_accueil_gratuits: e.target.value === 'oui' })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white"><option value="oui">Oui</option><option value="non">Non</option></select>
                          </div>
                          {!saisonConfig.produits_accueil_gratuits && (
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.confort_frais_produits ? 'none' : undefined }}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-xs text-gray-600">Frais produits d'accueil (DT)</label>
                                <button type="button" onClick={() => removeUiBlock('confort_frais_produits')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                              </div>
                              <input type="number" min={0} value={saisonConfig.frais_produits_accueil ?? 0} onChange={(e) => updateSaisonConfig({ frais_produits_accueil: Number(e.target.value || 0) })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white" />
                            </div>
                          )}
                        </div>
                      )}
                      {isSecuriteDetailTab && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.securite_fumeurs ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Fumeurs</label>
                              <button type="button" onClick={() => removeUiBlock('securite_fumeurs')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <select value={saisonConfig.fumeurs || ''} onChange={(e) => updateSaisonConfig({ fumeurs: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white"><option value="">--</option>{SAISON_FUMEURS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.securite_alcool ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Alcool</label>
                              <button type="button" onClick={() => removeUiBlock('securite_alcool')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <select value={saisonConfig.alcool || ''} onChange={(e) => updateSaisonConfig({ alcool: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white"><option value="">--</option>{SAISON_ALCOOL_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.securite_fetes ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Fetes</label>
                              <button type="button" onClick={() => removeUiBlock('securite_fetes')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <select value={String((saisonConfig as any).fetes || '')} onChange={(e) => updateSaisonConfig({ fetes: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white"><option value="">--</option>{SAISON_FETES_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.securite_heures_silence ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Heures silence</label>
                              <button type="button" onClick={() => removeUiBlock('securite_heures_silence')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <select value={String((saisonConfig as any).heures_silence || '')} onChange={(e) => updateSaisonConfig({ heures_silence: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white">
                              <option value="">--</option>
                              {SAISON_HEURES_SILENCE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                          </div>
                          <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.securite_animaux ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Animaux</label>
                              <button type="button" onClick={() => removeUiBlock('securite_animaux')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <select value={saisonConfig.animaux || ''} onChange={(e) => updateSaisonConfig({ animaux: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white"><option value="">--</option>{SAISON_ANIMAUX_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                          </div>
                        </div>
                      )}
                      {isConditionsDetailTab && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.cond_duree_min ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Duree min sejour (nuits)</label>
                              <button type="button" onClick={() => removeUiBlock('cond_duree_min')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <input type="number" min={1} value={saisonConfig.duree_min_sejour_nuits ?? ''} onChange={(e) => updateSaisonConfig({ duree_min_sejour_nuits: e.target.value === '' ? null : Number(e.target.value) })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white" />
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.cond_duree_max ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Duree max sejour (nuits)</label>
                              <button type="button" onClick={() => removeUiBlock('cond_duree_max')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <input type="number" min={1} value={saisonConfig.duree_max_sejour_nuits ?? ''} onChange={(e) => updateSaisonConfig({ duree_max_sejour_nuits: e.target.value === '' ? null : Number(e.target.value) })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white" />
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.cond_annulation ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Politique annulation</label>
                              <button type="button" onClick={() => removeUiBlock('cond_annulation')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <select value={saisonConfig.politique_annulation || ''} onChange={(e) => updateSaisonConfig({ politique_annulation: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white"><option value="">--</option>{SAISON_POLITIQUE_ANNULATION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.cond_depot ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Depot de garantie</label>
                              <button type="button" onClick={() => removeUiBlock('cond_depot')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <select value={saisonConfig.depot_garantie ? 'oui' : 'non'} onChange={(e) => updateSaisonConfig({ depot_garantie: e.target.value === 'oui' })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white"><option value="oui">Oui</option><option value="non">Non</option></select>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.cond_montant_caution ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Montant caution</label>
                              <button type="button" onClick={() => removeUiBlock('cond_montant_caution')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <input type="number" min={0} value={saisonConfig.montant_caution ?? ''} onChange={(e) => updateSaisonConfig({ montant_caution: e.target.value === '' ? null : Number(e.target.value) })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white" />
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.cond_type_caution ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Type caution</label>
                              <button type="button" onClick={() => removeUiBlock('cond_type_caution')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <select value={saisonConfig.type_caution || ''} onChange={(e) => updateSaisonConfig({ type_caution: (e.target.value || null) as any })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white"><option value="">--</option>{SAISON_TYPE_CAUTION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.cond_checkin ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Check-in</label>
                              <button type="button" onClick={() => removeUiBlock('cond_checkin')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <input value={saisonConfig.checkin_heure || ''} onChange={(e) => updateSaisonConfig({ checkin_heure: e.target.value || null })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white" />
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm" style={{ display: removedUiBlocks.cond_checkout ? 'none' : undefined }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-xs text-gray-600">Check-out</label>
                              <button type="button" onClick={() => removeUiBlock('cond_checkout')} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600">Supprimer</button>
                            </div>
                            <input value={saisonConfig.checkout_heure || ''} onChange={(e) => updateSaisonConfig({ checkout_heure: e.target.value || null })} className="block w-full rounded-lg border-gray-300 border p-2 bg-white" />
                          </div>
                        </div>
                      )}
                      {renderDetailTabFeatures()}
                    </div>
                  )}
                  {!isInfoDetailTab && (formData.mode !== 'location_saisonniere') && renderDetailTabFeatures()}
                </div>
              )}
              <div className="flex justify-between">
                <button type="button" onClick={() => goToStep(2)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                <button type="button" onClick={() => validateStepBeforeContinue(3, 4)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 4</button>
              </div>
            </div>}
            {generalStep === 4 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Banknote className="h-5 w-5 inline text-emerald-600 mr-2" />Tarification</h3>
              {isModeVente ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">MÃ©thode de commission</label>
                      <select name="tarification_methode" value={currentTarificationMethode} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="avec_commission">Avec commission</option>
                        <option value="sans_commission">Sans commission</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prix affichÃ© client (DT)</label>
                      <input type="number" min={0} step="0.01" name="prix_affiche_client" value={formData.prix_affiche_client ?? formData.prix_nuitee ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                    </div>
                    {currentTarificationMethode === 'avec_commission' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix fixe propriÃ©taire (calculÃ©)</label>
                        <input readOnly value={venteTarificationPreview.prixFixeProprietaire} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix fixe propriÃ©taire (DT)</label>
                        <input type="number" min={0} step="0.01" name="prix_fixe_proprietaire" value={formData.prix_fixe_proprietaire ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prix proprietaire (DT)</label>
                      <input type="number" min={0} step="0.01" name="prix_proprietaire" value={formData.prix_proprietaire ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      <p className="mt-1 text-xs text-gray-500">Champ interne admin, non visible cote client.</p>
                    </div>
                  </div>
                  {currentTarificationMethode === 'avec_commission' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Commission part propriÃ©taire (%)</label>
                        <input type="number" min={0} step="0.01" name="commission_pourcentage_proprietaire" value={formData.commission_pourcentage_proprietaire ?? DEFAULT_COMMISSION_PROPRIETAIRE_PERCENT} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Commission part client (%)</label>
                        <input type="number" min={0} step="0.01" name="commission_pourcentage_client" value={formData.commission_pourcentage_client ?? DEFAULT_COMMISSION_CLIENT_PERCENT} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Montant max Ã  diminuer (DT)</label>
                        <input type="number" min={0} step="0.01" name="montant_max_reduction_negociation" value={formData.montant_max_reduction_negociation ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prix minimum acceptÃ© (calculÃ©)</label>
                        <input readOnly value={venteTarificationPreview.prixMinimumAccepte} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix final (DT)</label><input readOnly value={venteTarificationPreview.prixFinal} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Revenu agence (DT)</label><input readOnly value={venteTarificationPreview.revenuAgence} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix fixe propriÃ©taire (DT)</label><input readOnly value={venteTarificationPreview.prixFixeProprietaire} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix / nuit (DT)</label><input type="number" name="prix_nuitee" value={formData.prix_nuitee || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix / semaine (DT)</label><input type="number" min={0} step="0.01" name="prix_semaine" value={formData.prix_semaine ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Avance (DT)</label><input type="number" name="avance" value={formData.avance || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Caution (DT)</label><input type="number" name="caution" value={formData.caution || 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Prix proprietaire (DT)</label><input type="number" min={0} step="0.01" name="prix_proprietaire" value={formData.prix_proprietaire ?? 0} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                  </div>
                  <p className="text-xs text-gray-500">Prix proprietaire: champ interne admin, non visible cote client.</p>
                  {(formData.mode === 'location_saisonniere') && (
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h5 className="text-sm font-semibold text-emerald-800">Tarification saisonniere avancee</h5>
                        <span className="rounded-full bg-white border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700">Visible cote client</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg border border-emerald-100 bg-white p-3 space-y-2">
                          <label className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-700">
                            <span>Frais de menage disponibles</span>
                            <input
                              type="checkbox"
                              checked={saisonConfig.frais_menage_disponible ?? Number(saisonConfig.frais_menage ?? 0) > 0}
                              onChange={(e) => updateSaisonConfig({
                                frais_menage_disponible: e.target.checked,
                                frais_menage: e.target.checked ? Number(saisonConfig.frais_menage ?? 0) : 0,
                              })}
                              className="h-4 w-4"
                            />
                          </label>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Montant menage (DT)</label>
                            <input
                              type="number"
                              min={0}
                              disabled={!((saisonConfig.frais_menage_disponible ?? Number(saisonConfig.frais_menage ?? 0) > 0))}
                              value={saisonConfig.frais_menage ?? 0}
                              onChange={(e) => updateSaisonConfig({ frais_menage: Number(e.target.value || 0) })}
                              className={`block w-full rounded-lg border p-2 ${(saisonConfig.frais_menage_disponible ?? Number(saisonConfig.frais_menage ?? 0) > 0) ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-100 text-gray-400'}`}
                            />
                          </div>
                        </div>
                        <div className="rounded-lg border border-emerald-100 bg-white p-3 space-y-2">
                          <label className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-700">
                            <span>Frais de service disponibles</span>
                            <input
                              type="checkbox"
                              checked={saisonConfig.frais_service_disponible ?? Number(saisonConfig.frais_service ?? 0) > 0}
                              onChange={(e) => updateSaisonConfig({
                                frais_service_disponible: e.target.checked,
                                frais_service: e.target.checked ? Number(saisonConfig.frais_service ?? 0) : 0,
                              })}
                              className="h-4 w-4"
                            />
                          </label>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Montant service (DT)</label>
                            <input
                              type="number"
                              min={0}
                              disabled={!((saisonConfig.frais_service_disponible ?? Number(saisonConfig.frais_service ?? 0) > 0))}
                              value={saisonConfig.frais_service ?? 0}
                              onChange={(e) => updateSaisonConfig({ frais_service: Number(e.target.value || 0) })}
                              className={`block w-full rounded-lg border p-2 ${(saisonConfig.frais_service_disponible ?? Number(saisonConfig.frais_service ?? 0) > 0) ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-100 text-gray-400'}`}
                            />
                          </div>
                        </div>
                        <div className="rounded-lg border border-emerald-100 bg-white p-3">
                          <label className="block text-xs text-gray-600 mb-1">Avance (%)</label>
                          <input type="number" min={1} max={100} value={saisonConfig.avance_pourcentage ?? 30} onChange={(e) => updateSaisonConfig({ avance_pourcentage: Number(e.target.value || 30) })} className="block w-full rounded-lg border-gray-300 border p-2" />
                        </div>
                        <div><label className="block text-xs text-gray-600 mb-1">Voyageurs max (total)</label><input type="number" min={1} value={saisonConfig.limite_personnes_nuit ?? 1} onChange={(e) => updateSaisonConfig({ limite_personnes_nuit: Math.max(1, Number(e.target.value || 1)) })} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                        <div><label className="block text-xs text-gray-600 mb-1">Adultes max ({'>'} 18 ans)</label><input type="number" min={1} value={saisonConfig.max_adultes ?? 1} onChange={(e) => updateSaisonConfig({ max_adultes: Math.max(1, Number(e.target.value || 1)) })} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                        <div><label className="block text-xs text-gray-600 mb-1">Enfants max (3 a 17 ans)</label><input type="number" min={0} value={saisonConfig.max_enfants ?? 0} onChange={(e) => updateSaisonConfig({ max_enfants: Math.max(0, Number(e.target.value || 0)) })} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                        <div><label className="block text-xs text-gray-600 mb-1">Prix matelas supplementaire (DT)</label><input type="number" min={0} value={saisonConfig.matelas_supplementaire_prix ?? 25} onChange={(e) => updateSaisonConfig({ matelas_supplementaire_prix: Number(e.target.value || 0) })} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                        <div><label className="block text-xs text-gray-600 mb-1">Max matelas supplementaires</label><input type="number" min={0} value={saisonConfig.matelas_supplementaires_max ?? 0} onChange={(e) => updateSaisonConfig({ matelas_supplementaires_max: Number(e.target.value || 0) })} className="block w-full rounded-lg border-gray-300 border p-2" /></div>
                        <div><label className="block text-xs text-gray-600 mb-1">Produits d'accueil gratuits</label><select value={saisonConfig.produits_accueil_gratuits ? 'oui' : 'non'} onChange={(e) => updateSaisonConfig({ produits_accueil_gratuits: e.target.value === 'oui' })} className="block w-full rounded-lg border-gray-300 border p-2"><option value="oui">Oui</option><option value="non">Non</option></select></div>
                        {!saisonConfig.produits_accueil_gratuits && <div><label className="block text-xs text-gray-600 mb-1">Frais produits d'accueil (DT)</label><input type="number" min={0} value={saisonConfig.frais_produits_accueil ?? 0} onChange={(e) => updateSaisonConfig({ frais_produits_accueil: Number(e.target.value || 0) })} className="block w-full rounded-lg border-gray-300 border p-2" /></div>}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-gray-700">Services payants (factures cote client)</p>
                            <p className="text-[11px] text-gray-500">Les prix modifies ici s'appliquent seulement a ce bien.</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={selectedServiceCatalogId}
                              onChange={(e) => setSelectedServiceCatalogId(e.target.value)}
                              className="min-w-[260px] rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs text-gray-700"
                            >
                              <option value="">Choisir depuis catalogue</option>
                              {availableServiceCatalogOptions.map((service) => (
                                <option key={service.id} value={service.id}>
                                  {service.categorie} - {service.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => addServicePayantFromCatalog(selectedServiceCatalogId)}
                              disabled={!selectedServiceCatalogId}
                              className="px-2 py-1 text-xs rounded border border-emerald-300 text-emerald-700 bg-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Ajouter depuis catalogue
                            </button>
                            <button type="button" onClick={addServicePayant} className="px-2 py-1 text-xs rounded border border-emerald-300 text-emerald-700 bg-white">Ajouter service manuel</button>
                            <button
                              type="button"
                              onClick={() => setIsCatalogueManagerOpen((prev) => !prev)}
                              className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700 bg-white"
                            >
                              {isCatalogueManagerOpen ? 'Masquer catalogue DB' : 'Gerer catalogue DB'}
                            </button>
                          </div>
                        </div>
                        {availableServiceCatalogOptions.length === 0 && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Tous les services du catalogue sont deja disponibles pour ce bien.
                          </div>
                        )}
                        {isCatalogueManagerOpen && (
                          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-700">Catalogue global (base de donnees)</p>
                              <span className="text-[11px] text-slate-500">Les changements ici impactent le catalogue global.</span>
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                              <div className="grid min-w-[1120px] grid-cols-[170px_170px_1.3fr_130px_130px_180px_90px_96px_48px] gap-0 text-xs font-semibold text-white">
                                <div className="bg-slate-700 px-3 py-2">Categorie</div>
                                <div className="bg-slate-700 px-3 py-2">Service</div>
                                <div className="bg-slate-700 px-3 py-2">Description</div>
                                <div className="bg-slate-700 px-3 py-2">Prix base</div>
                                <div className="bg-slate-700 px-3 py-2">Prix affiche</div>
                                <div className="bg-slate-700 px-3 py-2">Tarification</div>
                                <div className="bg-slate-700 px-3 py-2">Actif</div>
                                <div className="bg-slate-700 px-3 py-2 text-center">Sauver</div>
                                <div className="bg-slate-700 px-3 py-2 text-center">x</div>
                              </div>
                              {serviceCatalogueOptions.map((service) => {
                                const serviceId = String(service.id || '').trim();
                                const draft = normalizeServicePayant(serviceCatalogueDrafts[serviceId] || service);
                                const isBusy = catalogueActionId === serviceId;
                                return (
                                  <div key={serviceId} className="grid min-w-[1120px] grid-cols-[170px_170px_1.3fr_130px_130px_180px_90px_96px_48px] gap-2 border-t border-slate-100 p-2 items-center">
                                    <input value={draft.categorie || ''} onChange={(e) => updateCatalogueDraft(serviceId, { categorie: e.target.value })} className="rounded-lg border-gray-300 border p-2 text-sm" />
                                    <input value={draft.label || ''} onChange={(e) => updateCatalogueDraft(serviceId, { label: e.target.value })} className="rounded-lg border-gray-300 border p-2 text-sm" />
                                    <input value={draft.description_courte || ''} onChange={(e) => updateCatalogueDraft(serviceId, { description_courte: e.target.value })} className="rounded-lg border-gray-300 border p-2 text-sm" />
                                    <input type="number" min={0} value={draft.prix ?? 0} onChange={(e) => updateCatalogueDraft(serviceId, { prix: Number(e.target.value || 0) })} className="rounded-lg border-gray-300 border p-2 text-sm" />
                                    <input value={draft.prix_affiche || ''} onChange={(e) => updateCatalogueDraft(serviceId, { prix_affiche: e.target.value })} className="rounded-lg border-gray-300 border p-2 text-sm" />
                                    <select value={draft.type_tarification} onChange={(e) => updateCatalogueDraft(serviceId, { type_tarification: e.target.value as ServicePayantBien['type_tarification'] })} className="rounded-lg border-gray-300 border p-2 text-sm">
                                      <option value="fixe">{getServiceTarificationLabel('fixe')}</option>
                                      <option value="sur_demande">{getServiceTarificationLabel('sur_demande')}</option>
                                      <option value="a_partir_de">{getServiceTarificationLabel('a_partir_de')}</option>
                                    </select>
                                    <label className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={draft.enabled !== false} onChange={(e) => updateCatalogueDraft(serviceId, { enabled: e.target.checked })} />Actif</label>
                                    <button type="button" disabled={isBusy} onClick={() => void handleSaveCatalogueService(serviceId)} className="h-9 rounded border border-emerald-300 text-emerald-700 text-xs disabled:opacity-50">{isBusy ? '...' : 'Sauver'}</button>
                                    <button type="button" disabled={isBusy} onClick={() => void handleDeleteCatalogueService(serviceId)} className="h-9 w-9 rounded border border-red-300 text-red-600 text-sm disabled:opacity-50">x</button>
                                  </div>
                                );
                              })}
                              <div className="grid min-w-[1120px] grid-cols-[170px_170px_1.3fr_130px_130px_180px_90px_96px_48px] gap-2 border-t border-slate-200 bg-slate-50 p-2 items-center">
                                <input value={newCatalogueService.categorie || ''} onChange={(e) => setNewCatalogueService((prev) => normalizeServicePayant({ ...prev, categorie: e.target.value }))} placeholder="Categorie" className="rounded-lg border-gray-300 border p-2 text-sm" />
                                <input value={newCatalogueService.label || ''} onChange={(e) => setNewCatalogueService((prev) => normalizeServicePayant({ ...prev, label: e.target.value }))} placeholder="Nouveau service" className="rounded-lg border-gray-300 border p-2 text-sm" />
                                <input value={newCatalogueService.description_courte || ''} onChange={(e) => setNewCatalogueService((prev) => normalizeServicePayant({ ...prev, description_courte: e.target.value }))} placeholder="Description courte" className="rounded-lg border-gray-300 border p-2 text-sm" />
                                <input type="number" min={0} value={newCatalogueService.prix ?? 0} onChange={(e) => setNewCatalogueService((prev) => normalizeServicePayant({ ...prev, prix: Number(e.target.value || 0) }))} className="rounded-lg border-gray-300 border p-2 text-sm" />
                                <input value={newCatalogueService.prix_affiche || ''} onChange={(e) => setNewCatalogueService((prev) => normalizeServicePayant({ ...prev, prix_affiche: e.target.value }))} placeholder="Ex: 50 DT" className="rounded-lg border-gray-300 border p-2 text-sm" />
                                <select value={newCatalogueService.type_tarification || 'fixe'} onChange={(e) => setNewCatalogueService((prev) => normalizeServicePayant({ ...prev, type_tarification: e.target.value as ServicePayantBien['type_tarification'] }))} className="rounded-lg border-gray-300 border p-2 text-sm">
                                  <option value="fixe">{getServiceTarificationLabel('fixe')}</option>
                                  <option value="sur_demande">{getServiceTarificationLabel('sur_demande')}</option>
                                  <option value="a_partir_de">{getServiceTarificationLabel('a_partir_de')}</option>
                                </select>
                                <label className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={newCatalogueService.enabled !== false} onChange={(e) => setNewCatalogueService((prev) => normalizeServicePayant({ ...prev, enabled: e.target.checked }))} />Actif</label>
                                <button type="button" disabled={catalogueActionId === '__new__'} onClick={() => void handleCreateCatalogueService()} className="h-9 rounded border border-emerald-300 text-emerald-700 text-xs disabled:opacity-50">Ajouter</button>
                                <span />
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="overflow-x-auto rounded-lg border border-emerald-100 bg-white">
                          <div className="grid min-w-[980px] grid-cols-[180px_180px_1.4fr_130px_180px_90px_48px] gap-0 text-xs font-semibold text-white">
                            <div className="bg-slate-800 px-3 py-2">Categorie</div>
                            <div className="bg-slate-800 px-3 py-2">Service</div>
                            <div className="bg-slate-800 px-3 py-2">Description courte</div>
                            <div className="bg-slate-800 px-3 py-2">Prix affiche</div>
                            <div className="bg-slate-800 px-3 py-2">Type de tarification</div>
                            <div className="bg-slate-800 px-3 py-2">Actif</div>
                            <div className="bg-slate-800 px-3 py-2 text-center">x</div>
                          </div>
                          {(saisonConfig.services_payants || []).map((service, index) => {
                            const normalizedService = normalizeServicePayant(service);
                            return (
                              <div key={service.id || index} className="grid min-w-[980px] grid-cols-[180px_180px_1.4fr_130px_180px_90px_48px] gap-2 border-t border-emerald-50 p-2 items-center">
                                <input value={normalizedService.categorie || ''} onChange={(e) => updateServicePayant(index, { categorie: e.target.value })} placeholder="Categorie" className="rounded-lg border-gray-300 border p-2 text-sm" />
                                <input value={normalizedService.label || ''} onChange={(e) => updateServicePayant(index, { label: e.target.value })} placeholder="Service" className="rounded-lg border-gray-300 border p-2 text-sm" />
                                <input value={normalizedService.description_courte || ''} onChange={(e) => updateServicePayant(index, { description_courte: e.target.value })} placeholder="Description courte" className="rounded-lg border-gray-300 border p-2 text-sm" />
                                <input type="number" min={0} value={normalizedService.prix ?? 0} onChange={(e) => updateServicePayant(index, { prix: Number(e.target.value || 0) })} className="rounded-lg border-gray-300 border p-2 text-sm" />
                                <select value={normalizedService.type_tarification} onChange={(e) => updateServicePayant(index, { type_tarification: e.target.value as ServicePayantBien['type_tarification'] })} className="rounded-lg border-gray-300 border p-2 text-sm">
                                  <option value="fixe">{getServiceTarificationLabel('fixe')}</option>
                                  <option value="sur_demande">{getServiceTarificationLabel('sur_demande')}</option>
                                  <option value="a_partir_de">{getServiceTarificationLabel('a_partir_de')}</option>
                                </select>
                                <label className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={normalizedService.enabled !== false} onChange={(e) => updateServicePayant(index, { enabled: e.target.checked })} />Actif</label>
                                <button type="button" onClick={() => removeServicePayant(index)} className="h-9 w-9 rounded border border-red-300 text-red-600 text-sm">x</button>
                              </div>
                            );
                          })}
                          {(saisonConfig.services_payants || []).length === 0 && (
                            <div className="px-3 py-4 text-sm text-gray-500">Aucun service payant configure.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between">
                <button type="button" onClick={() => goToStep(3)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                {isModeVente
                  ? <button type="button" onClick={() => validateStepBeforeContinue(4, 5)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Continuer vers etape 5</button>
                  : <button type="button" onClick={() => validateStepBeforeContinue(4)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Valider etape 4</button>}
              </div>
            </div>}
            {isModeVente && generalStep === 5 && <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold"><Banknote className="h-5 w-5 inline text-emerald-600 mr-2" />Modalite de paiement (Vente)</h3>
              {isModeVente ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement</label>
                      <select name="modalite_paiement_vente" value={currentModalitePaiementVente} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2">
                        <option value="comptant">Comptant</option>
                        <option value="facilite">Facilite de paiement</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prix total client (DT)</label>
                      <input readOnly value={venteTarificationPreview.prixFinal} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">1ere partie promesse (DT)</label>
                      <input readOnly value={ventePaiementPreview.montantPremierePartiePromesse} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" />
                    </div>
                  </div>
                  {currentModalitePaiementVente === 'facilite' ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Pourcentage 1ere partie (%)</label>
                          <input type="number" min={0} max={100} step="0.01" name="pourcentage_premiere_partie_promesse" value={formData.pourcentage_premiere_partie_promesse ?? DEFAULT_POURCENTAGE_PREMIERE_PARTIE_PROMESSE} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de tranches</label>
                          <input type="number" min={1} step="1" name="nombre_tranches" value={formData.nombre_tranches ?? 6} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Periode totale (mois)</label>
                          <input type="number" min={1} step="1" name="periode_tranches_mois" value={formData.periode_tranches_mois ?? 6} onChange={handleChange} className="block w-full rounded-lg border-gray-300 border p-2" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">2eme partie restante (DT)</label><input readOnly value={ventePaiementPreview.montantDeuxiemePartie} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Montant par tranche (DT)</label><input readOnly value={ventePaiementPreview.montantParTranche} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Resume</label><input readOnly value={`${ventePaiementPreview.nombreTranches} tranches / ${ventePaiementPreview.periodeTranchesMois} mois`} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Montant comptant (DT)</label><input readOnly value={ventePaiementPreview.montantPremierePartiePromesse} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Reste (DT)</label><input readOnly value={0} className="block w-full rounded-lg border-gray-300 border p-2 bg-gray-50 text-gray-700" /></div>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <button type="button" onClick={() => goToStep(4)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Retour</button>
                    <button type="button" onClick={() => validateStepBeforeContinue(5)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Valider etape 5</button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">La modalite de paiement est geree uniquement pour le mode vente.</p>
              )}
            </div>}
          </div>
        )}
        {activeTab === 'images' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h3 className="text-lg font-semibold mb-4"><ImageIcon className="h-5 w-5 inline text-emerald-600 mr-2" />Gestion des images</h3>
              {normalizeLegacyType((formData.type || 'appartement') as BienType) === 'local_commercial' && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motif d'upload photo du local</label>
                  <input
                    type="text"
                    value={newImageMotif}
                    onChange={(e) => setNewImageMotif(e.target.value)}
                    placeholder="Ex: Facade, Vitrine, Interieur, Reserve..."
                    className="w-full rounded-lg border-gray-300 border p-2"
                  />
                </div>
              )}
              {(isImmeubleVente || isLotissementVente) ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Les images client sont sÃ©parÃ©es par {(isImmeubleVente ? "unitÃ© d'immeuble" : "terrain")} pour Ã©viter tout mÃ©lange.
                  </p>
                  {(isImmeubleVente ? immeubleClientImageUnits : lotissementClientImageUnits).map(({ unitKey, label }) => {
                    const unitMotif = buildUnitGalleryMotif(
                      (formData.mode || 'location_saisonniere') as BienMode,
                      normalizeLegacyType((formData.type || 'appartement') as BienType),
                      unitKey
                    );
                    const unitImages = getUnitClientImages(unitKey);
                    return (
                      <div key={unitKey} className="rounded-lg border border-gray-200 p-3">
                        <h4 className="text-sm font-semibold text-gray-800 mb-2">{label}</h4>
                        <div className="flex gap-2 mb-3">
                          <input type="text" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder={`URL de l'image - ${label}`} className="flex-1 rounded-lg border-gray-300 border p-2" />
                          <button type="button" onClick={() => handleAddImage(unitMotif)} disabled={!newImageUrl.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">Ajouter</button>
                        </div>
                        <div className="mb-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                            <Upload className="h-4 w-4 text-emerald-600" />
                            <span>Ou upload ({label})</span>
                          </label>
                          <input type="file" accept="image/*,.heic,.heif" multiple onChange={(e) => handleFileUpload(e, unitMotif)} disabled={uploading} className="block w-full text-sm" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                          {unitImages.map((img, index) => (
                            <div key={img.id} className="relative group rounded-lg overflow-hidden border border-gray-200">
                              <SmartImage src={resolveMediaUrl(img.url)} alt={label} className="w-full h-24 object-cover" loading="lazy" decoding="async" fetchPriority="low" targetWidth={320} quality={55} />
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(img.id)}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full shadow"
                                aria-label="Supprimer l'image"
                                title="Supprimer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              <span className="absolute bottom-1 right-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">{index + 1}/{unitImages.length}</span>
                            </div>
                          ))}
                          {unitImages.length === 0 && <div className="col-span-full text-xs text-gray-500">Aucune image pour {label.toLowerCase()}.</div>}
                        </div>
                      </div>
                    );
                  })}
                  {isImmeubleVente && immeubleClientImageUnits.length === 0 && (
                    <div className="text-xs text-gray-500">Ajoutez le nombre d'appartements, de garages ou de locaux commerciaux dans les dÃ©tails immeuble.</div>
                  )}
                  {uploading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600 mt-2"></div>}
                </div>
              ) : (
                <>
                  <div className="flex gap-2 mb-4"><input type="text" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="URL de l'image" className="flex-1 rounded-lg border-gray-300 border p-2" /><button type="button" onClick={handleAddImage} disabled={!newImageUrl.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">Ajouter</button></div>
                  <div className="mb-6">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <Upload className="h-4 w-4 text-emerald-600" />
                      <span>Ou upload</span>
                    </label>
                    <input type="file" accept="image/*,.heic,.heif" multiple onChange={handleFileUpload} disabled={uploading} className="block w-full text-sm" />
                    {uploading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600 mt-2"></div>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {clientVisibleImages.map((img, index) => (
                      <div
                        key={img.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, img.id)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(img.id)}
                        onDragEnd={handleDragEnd}
                        className={`relative group rounded-lg overflow-hidden border border-gray-200 ${draggedImageIndex === img.id ? 'opacity-60 ring-2 ring-emerald-300' : ''}`}
                        style={{ contentVisibility: 'auto', containIntrinsicSize: '180px' }}
                      >
                        <SmartImage
                          src={resolveMediaUrl(img.url)}
                          alt=""
                          className="w-full h-32 object-cover"
                          loading="lazy"
                          decoding="async"
                          fetchPriority="low"
                          targetWidth={360}
                          quality={55}
                        />
                        <div className="absolute top-2 right-2 p-1 bg-black/40 text-white rounded cursor-grab"><GripVertical className="h-3.5 w-3.5" /></div>
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleMoveImage(img.id, 'up')}
                            disabled={index === 0}
                            className="p-1.5 bg-white/95 rounded-full disabled:opacity-50 shadow"
                            aria-label="Monter l'image"
                            title="Monter"
                          >
                            <ChevronUp className="h-4 w-4 text-gray-800" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveImage(img.id, 'down')}
                            disabled={index === clientVisibleImages.length - 1}
                            className="p-1.5 bg-white/95 rounded-full disabled:opacity-50 shadow"
                            aria-label="Descendre l'image"
                            title="Descendre"
                          >
                            <ChevronDown className="h-4 w-4 text-gray-800" />
                          </button>
                          {index !== 0 && (
                            <button
                              type="button"
                              onClick={() => handleSetMainImage(index)}
                              className="p-1.5 bg-emerald-500 text-white rounded-full shadow"
                              aria-label="DÃ©finir comme image principale"
                              title="DÃ©finir en principale"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(img.id)}
                            className="p-1.5 bg-red-500 text-white rounded-full shadow"
                            aria-label="Supprimer l'image"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {index === 0 && <span className="absolute top-2 left-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded">Principale</span>}
                        {!!img.motif_upload && <span className="absolute top-2 left-20 bg-white/90 text-gray-700 text-xs px-2 py-0.5 rounded border">{img.motif_upload}</span>}
                        <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">{index + 1}/{clientVisibleImages.length}</span>
                      </div>
                    ))}
                    {clientVisibleImages.length === 0 && <div className="col-span-full text-center py-8 text-gray-500">Aucune image</div>}
                  </div>
                  <div className="mt-8 border-t border-gray-200 pt-6">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">VidÃ©os du bien</h4>
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newVideoUrl}
                        onChange={(e) => setNewVideoUrl(e.target.value)}
                        placeholder="Lien YouTube ou Facebook"
                        className="flex-1 rounded-lg border-gray-300 border p-2"
                      />
                      <button
                        type="button"
                        onClick={handleAddVideo}
                        disabled={!newVideoUrl.trim()}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50"
                      >
                        Ajouter
                      </button>
                    </div>
                    <p className="mb-6 text-xs text-gray-500">Collez un lien YouTube (`youtube.com`, `youtu.be`, `shorts`) ou Facebook (`facebook.com/watch`, `facebook.com/reel`, `facebook.com/.../videos`, `fb.watch`). Evitez `facebook.com/share/...` qui peut afficher Video Unavailable.</p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {clientVisibleVideos.map((video, index) => {
  const embedUrl = toVideoEmbedUrl(video.url);
  const externalUrl = toVideoExternalUrl(video.url) || String(video.url || '').trim();
  const directUrl = facebookDirectVideoUrls[String(video.url || '').trim()] || '';
  const canEmbed = Boolean(embedUrl) && canRenderVideoInIframe(video.url);
  const shouldUseDirectVideo = isFacebookVideoUrl(video.url) && Boolean(directUrl);
  return (
    <div key={video.id} className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 p-2">
      {shouldUseDirectVideo ? (
        <video
          src={directUrl}
          controls
          playsInline
          muted={false}
          defaultMuted={false}
          onLoadedMetadata={(event) => {
            event.currentTarget.muted = false;
            if (event.currentTarget.volume === 0) event.currentTarget.volume = 1;
          }}
          onPlay={(event) => {
            event.currentTarget.muted = false;
            if (event.currentTarget.volume === 0) event.currentTarget.volume = 1;
          }}
          className="w-full h-56 rounded-lg bg-black"
          preload="metadata"
        />
      ) : canEmbed ? (
        <iframe
          src={embedUrl || ''}
          title={`Video ${index + 1}`}
          className="w-full h-56 rounded-lg bg-black"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : directUrl && !isFacebookVideoUrl(video.url) ? (
        <video
          src={directUrl}
          controls
          playsInline
          muted={false}
          defaultMuted={false}
          onLoadedMetadata={(event) => {
            event.currentTarget.muted = false;
            if (event.currentTarget.volume === 0) event.currentTarget.volume = 1;
          }}
          onPlay={(event) => {
            event.currentTarget.muted = false;
            if (event.currentTarget.volume === 0) event.currentTarget.volume = 1;
          }}
          className="w-full h-56 rounded-lg bg-black"
          preload="metadata"
        />
      ) : (
        <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-lg bg-slate-900 p-4 text-center text-white">
          <p className="text-sm font-semibold">Integration Facebook indisponible</p>
          <p className="text-xs text-slate-200">Cette video ne peut pas etre integree en iframe. Ouvrez-la directement sur Facebook.</p>
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-slate-900"
          >
            Ouvrir la video
          </a>
        </div>
      )}
      <button
        type="button"
        onClick={() => handleRemoveImage(video.id)}
        className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full shadow"
        aria-label="Supprimer la vidÃ©o"
        title="Supprimer"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <span className="absolute bottom-4 right-4 bg-black/60 text-white text-xs px-2 py-0.5 rounded">{index + 1}/{clientVisibleVideos.length}</span>
    </div>
  );
})}
                      {clientVisibleVideos.length === 0 && <div className="col-span-full text-center py-6 text-gray-500">Aucune vidÃ©o</div>}
                    </div>
                  </div>
                </>
              )}
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('general');
                    setGeneralStep(isModeVente ? 5 : 4);
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  Retour
                </button>
                {!isModeVente ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('calendar')}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm"
                  >
                    Continuer vers calendrier
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toast.success('Images validees')}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm"
                  >
                    Valider images
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {!isModeVente && activeTab === 'calendar' && (
          <div className="max-w-5xl mx-auto">
            <AdminCalendar
              dates={unavailableDates}
              onDatesChange={setUnavailableDates}
              pricingPeriods={pricingPeriods}
              onPricingPeriodsChange={setPricingPeriods}
              defaultNightlyPrice={Number(formData.prix_nuitee || 0)}
              defaultWeeklyPrice={formData.prix_semaine === null || formData.prix_semaine === undefined ? null : Number(formData.prix_semaine || 0)}
            />
          </div>
        )}
      </div>
      <Dialog.Root open={zoneDeleteDialog.open} onOpenChange={(open) => setZoneDeleteDialog((prev) => ({ ...prev, open }))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
          <Dialog.Content className="fixed z-[61] left-1/2 top-1/2 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Supprimer une zone</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-600">
              Zone: <span className="font-medium text-gray-900">{zoneDeleteDialog.sourceLabel}</span>
            </Dialog.Description>
            <div className="mt-4 space-y-3">
              {zoneDeleteDialog.loading ? (
                <div className="text-sm text-gray-500">Chargement des biens liÃ©s...</div>
              ) : (
                <>
                  <p className="text-sm text-gray-700">
                    {zoneDeleteDialog.linkedBiens.length > 0
                      ? `${zoneDeleteDialog.linkedBiens.length} bien(s) utilisent cette zone.`
                      : 'Aucun bien liÃ©. La zone peut Ãªtre supprimÃ©e directement.'}
                  </p>
                  {zoneDeleteDialog.linkedBiens.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">RÃ©affecter tous les biens vers</label>
                      <select
                        value={zoneDeleteDialog.targetId}
                        onChange={(e) => setZoneDeleteDialog((prev) => ({ ...prev, targetId: e.target.value }))}
                        className="block w-full rounded-lg border border-gray-300 p-2"
                      >
                        <option value="">-- Choisir une zone --</option>
                        {zonesOptions.filter((item) => item.id !== zoneDeleteDialog.sourceId).map((item) => (
                          <option key={item.id} value={item.id}>{item.nom}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
                    {zoneDeleteDialog.linkedBiens.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500">Aucun bien</div>
                    ) : (
                      <ul className="divide-y divide-gray-200">
                        {zoneDeleteDialog.linkedBiens.map((bien) => (
                          <li key={bien.id} className="p-3 text-sm">
                            <p className="font-medium text-gray-900">{bien.titre || '(Sans titre)'}</p>
                            <p className="text-gray-500">
                              Ref: {bien.reference || '-'} â€¢ Mode: {modeLabels[(bien.mode as BienMode)] || bien.mode || '-'} â€¢ Type: {typeLabels[(bien.type as BienType)] || bien.type || '-'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setZoneDeleteDialog((prev) => ({ ...prev, open: false }))} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700">Annuler</button>
              <button
                type="button"
                onClick={handleConfirmDeleteZone}
                disabled={zoneDeleteDialog.loading || zoneDeleteDialog.submitting || (zoneDeleteDialog.linkedBiens.length > 0 && !zoneDeleteDialog.targetId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-50"
              >
                {zoneDeleteDialog.submitting ? 'Suppression...' : 'RÃ©affecter et supprimer'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={ownerDeleteDialog.open} onOpenChange={(open) => setOwnerDeleteDialog((prev) => ({ ...prev, open }))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
          <Dialog.Content className="fixed z-[61] left-1/2 top-1/2 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Supprimer un propriÃ©taire</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-600">
              PropriÃ©taire: <span className="font-medium text-gray-900">{ownerDeleteDialog.sourceLabel}</span>
            </Dialog.Description>
            <div className="mt-4 space-y-3">
              {ownerDeleteDialog.loading ? (
                <div className="text-sm text-gray-500">Chargement des biens liÃ©s...</div>
              ) : (
                <>
                  <p className="text-sm text-gray-700">
                    {ownerDeleteDialog.linkedBiens.length > 0
                      ? `${ownerDeleteDialog.linkedBiens.length} bien(s) utilisent ce propriÃ©taire.`
                      : 'Aucun bien liÃ©. Le propriÃ©taire peut Ãªtre supprimÃ© directement.'}
                  </p>
                  {ownerDeleteDialog.linkedBiens.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">RÃ©affecter tous les biens vers</label>
                      <select
                        value={ownerDeleteDialog.targetId}
                        onChange={(e) => setOwnerDeleteDialog((prev) => ({ ...prev, targetId: e.target.value }))}
                        className="block w-full rounded-lg border border-gray-300 p-2"
                      >
                        <option value="">-- Choisir un propriÃ©taire --</option>
                        {proprietaireOptions.filter((item) => item.id !== ownerDeleteDialog.sourceId).map((item) => (
                          <option key={item.id} value={item.id}>{item.nom}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
                    {ownerDeleteDialog.linkedBiens.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500">Aucun bien</div>
                    ) : (
                      <ul className="divide-y divide-gray-200">
                        {ownerDeleteDialog.linkedBiens.map((bien) => (
                          <li key={bien.id} className="p-3 text-sm">
                            <p className="font-medium text-gray-900">{bien.titre || '(Sans titre)'}</p>
                            <p className="text-gray-500">
                              Ref: {bien.reference || '-'} â€¢ Mode: {modeLabels[(bien.mode as BienMode)] || bien.mode || '-'} â€¢ Type: {typeLabels[(bien.type as BienType)] || bien.type || '-'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOwnerDeleteDialog((prev) => ({ ...prev, open: false }))} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700">Annuler</button>
              <button
                type="button"
                onClick={handleConfirmDeleteProprietaire}
                disabled={ownerDeleteDialog.loading || ownerDeleteDialog.submitting || (ownerDeleteDialog.linkedBiens.length > 0 && !ownerDeleteDialog.targetId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-50"
              >
                {ownerDeleteDialog.submitting ? 'Suppression...' : 'RÃ©affecter et supprimer'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={validationDialogState.open} onOpenChange={(open) => setValidationDialogState((prev) => ({ ...prev, open }))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
          <Dialog.Content className="fixed z-[61] left-1/2 top-1/2 w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
            <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Champs obligatoires manquants
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-600">Completez les champs ci-dessous avant de continuer.</Dialog.Description>
            <div className="mt-4 space-y-3">
              {validationDialogState.issues.map((issue, index) => (
                <div key={`${issue.step}-${issue.fieldName}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border border-red-100 bg-red-50/60 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Etape {issue.step} - {issue.label}</p>
                    <p className="text-sm text-gray-600">{issue.message}</p>
                  </div>
                  <button type="button" onClick={() => focusValidationIssue(issue)} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white">
                    Allez
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setValidationDialogState({ open: false, issues: [] })} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700">Fermer</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={featureExistsDialog.open}
        onOpenChange={(open) => setFeatureExistsDialog((prev) => ({ ...prev, open }))}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
          <Dialog.Content className="fixed z-[61] left-1/2 top-1/2 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Caracteristique existante</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-600">
              {featureExistsDialog.canAddToCurrentContext
                ? `La caracteristique "${featureExistsDialog.featureName}" existe deja dans un autre mode/type.`
                : `La caracteristique "${featureExistsDialog.featureName}" existe deja pour ce mode/type.`}
            </Dialog.Description>
            {featureExistsDialog.canAddToCurrentContext && (
              <p className="mt-2 text-sm text-gray-700">
                Voulez-vous l&apos;ajouter pour {modeLabels[featureExistsDialog.mode]} / {typeLabels[featureExistsDialog.type]} ?
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFeatureExistsDialog((prev) => ({ ...prev, open: false }))}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700"
              >
                Fermer
              </button>
              {featureExistsDialog.canAddToCurrentContext && featureExistsDialog.payload && (
                <button
                  type="button"
                  onClick={() => void createFeatureWithContext(featureExistsDialog.payload as PendingFeatureAddition, { skipExistingCheck: true })}
                  disabled={featureSaving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"
                >
                  {featureSaving ? 'Ajout...' : 'Ajouter pour ce mode/type'}
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  );
}

function AdminCalendar({
  dates,
  onDatesChange,
  pricingPeriods,
  onPricingPeriodsChange,
  defaultNightlyPrice,
  defaultWeeklyPrice,
}: {
  dates: DateStatus[];
  onDatesChange: (dates: DateStatus[]) => void;
  pricingPeriods: SeasonalPricingPeriod[];
  onPricingPeriodsChange: (periods: SeasonalPricingPeriod[]) => void;
  defaultNightlyPrice: number;
  defaultWeeklyPrice?: number | null;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'blocked' | 'booked' | 'pending'>('blocked');
  const [periodNightlyPrice, setPeriodNightlyPrice] = useState<number>(Math.max(0, Number(defaultNightlyPrice || 0)));
  const [periodWeeklyPrice, setPeriodWeeklyPrice] = useState<number>(Math.max(0, Number(defaultWeeklyPrice || 0)));
  const [periodMinimumNights, setPeriodMinimumNights] = useState<number>(1);
  const [periodCheckinDay, setPeriodCheckinDay] = useState<string>('');
  const [periodCheckoutDay, setPeriodCheckoutDay] = useState<string>('');
  const [pricingScope, setPricingScope] = useState<'global' | 'amicales' | 'amicale'>('global');
  const [pricingAmicaleId, setPricingAmicaleId] = useState<string>('');
  const [amicaleOptions, setAmicaleOptions] = useState<Array<{ id: string; name: string; code: string; logoUrl?: string }>>([]);
  const weekdayOptions = [
    { value: 'lundi', label: 'Lundi' },
    { value: 'mardi', label: 'Mardi' },
    { value: 'mercredi', label: 'Mercredi' },
    { value: 'jeudi', label: 'Jeudi' },
    { value: 'vendredi', label: 'Vendredi' },
    { value: 'samedi', label: 'Samedi' },
    { value: 'dimanche', label: 'Dimanche' },
  ];
  const monthStart = startOfMonth(currentMonth), monthEnd = endOfMonth(currentMonth), calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }), calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 }), days = eachDayOfInterval({ start: calendarStart, end: calendarEnd }), today = startOfDay(new Date());
  const parseDateSafe = (value?: string | null): Date | null => {
    const raw = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const parsed = parseISO(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const formatDateSafe = (value?: string | null): string => {
    const parsed = parseDateSafe(value);
    if (!parsed) return String(value || '-');
    return format(parsed, 'dd/MM/yyyy');
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchAmicalesAdmin();
        if (!cancelled) setAmicaleOptions(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setAmicaleOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvePricingScopeLabel = useCallback((period?: SeasonalPricingPeriod | null) => {
    const scope = String(period?.scope || '').trim().toLowerCase() || (String(period?.amicale_id || '').trim() ? 'amicale' : 'global');
    if (scope === 'global') return 'Global (tous les clients)';
    if (scope === 'amicales') return 'Toutes les amicales';
    const value = String(period?.amicale_id || '').trim();
    if (!value) return 'Amicale specifique';
    return `Amicale: ${amicaleOptions.find((item) => item.id === value)?.name || value}`;
  }, [amicaleOptions]);

  const getDateStatus = (date: Date): DateStatus | undefined => dates.find((range) => {
    if (!range?.start || !range?.end) return false;
    const start = parseDateSafe(range.start);
    const end = parseDateSafe(range.end);
    if (!start || !end || end < start) return false;
    return isWithinInterval(date, { start, end });
  });
  const handleDateClick = (date: Date) => { if (isBefore(date, today)) return; if (!selectionStart || (selectionStart && selectionEnd)) { setSelectionStart(date); setSelectionEnd(null); } else { if (date < selectionStart) setSelectionStart(date); else setSelectionEnd(date); } };
  const buildDateStatus = (start: string, end: string): DateStatus => ({ start, end, status: selectedStatus, color: selectedStatus === 'booked' ? '#ef4444' : selectedStatus === 'pending' ? '#f97316' : '#111827' });
  const handleAddPeriod = () => { if (!selectionStart || !selectionEnd) return; const start = format(selectionStart < selectionEnd ? selectionStart : selectionEnd, 'yyyy-MM-dd'); const end = format(selectionStart < selectionEnd ? selectionEnd : selectionStart, 'yyyy-MM-dd'); onDatesChange([...dates, buildDateStatus(start, end)]); setSelectionStart(null); setSelectionEnd(null); toast.success('Periode ajoutee'); };
  const handleManualAddPeriod = () => { if (!manualStartDate || !manualEndDate) return toast.error('Choisissez les deux dates'); if (manualEndDate < manualStartDate) return toast.error('La date de fin doit etre apres la date de debut'); onDatesChange([...dates, buildDateStatus(manualStartDate, manualEndDate)]); setManualStartDate(''); setManualEndDate(''); toast.success('Periode ajoutee'); };
  const handleRemovePeriod = (index: number) => { onDatesChange(dates.filter((_, i) => i !== index)); toast.success('Periode supprimee'); };
  const getDayClassName = (date: Date) => { const status = getDateStatus(date); const isPast = isBefore(date, today); const isSelected = (selectionStart && date.getTime() === selectionStart.getTime()) || (selectionEnd && date.getTime() === selectionEnd.getTime()); const inSelectionRange = selectionStart && selectionEnd && isWithinInterval(date, { start: selectionStart < selectionEnd ? selectionStart : selectionEnd, end: selectionStart < selectionEnd ? selectionEnd : selectionStart }); let base = "w-full h-12 sm:h-14 lg:h-16 flex items-center justify-center text-sm rounded-lg cursor-pointer "; if (isPast) base += "text-gray-300 cursor-not-allowed "; else if (status) base += "text-white font-medium "; else if (isSelected || inSelectionRange) base += "bg-emerald-500 text-white font-bold "; else base += "bg-green-100 text-green-700 hover:bg-green-200 "; return base; };
  const getDayBackground = (date: Date) => { const status = getDateStatus(date); if (status?.color) return status.color; if (status?.status === 'booked') return '#ef4444'; if (status?.status === 'pending') return '#f97316'; if (status?.status === 'blocked') return '#111827'; return ''; };

  const addPricingPeriod = (start: string, end: string) => {
    const nightly = Math.max(0, Number(periodNightlyPrice || 0));
    const weekly = Math.max(0, Number(periodWeeklyPrice || 0));
    if (nightly <= 0) {
      toast.error('Prix nuitee requis');
      return;
    }
    if (pricingScope === 'amicale' && !String(pricingAmicaleId || '').trim()) {
      toast.error('Selectionnez une amicale specifique');
      return;
    }
    const newPeriod: SeasonalPricingPeriod = {
      id: `pp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      start,
      end,
      prix_nuitee: nightly,
      prix_semaine: weekly > 0 ? weekly : null,
      minimum_nuitees: Math.max(1, Math.floor(Number(periodMinimumNights || 1))),
      checkin_jour: periodCheckinDay || null,
      checkout_jour: periodCheckoutDay || null,
      scope: pricingScope,
      amicale_id: pricingScope === 'amicale' ? (pricingAmicaleId || null) : null,
    };
    onPricingPeriodsChange([...(Array.isArray(pricingPeriods) ? pricingPeriods : []), newPeriod]);
    toast.success('Periode tarifaire ajoutee');
  };

  const handleAddPricingFromSelection = () => {
    if (!selectionStart || !selectionEnd) return toast.error('Selectionnez une periode');
    const start = format(selectionStart < selectionEnd ? selectionStart : selectionEnd, 'yyyy-MM-dd');
    const end = format(selectionStart < selectionEnd ? selectionEnd : selectionStart, 'yyyy-MM-dd');
    addPricingPeriod(start, end);
  };

  const upsertPricingPeriodForSelection = (options: { applyPricing?: boolean; applyMinimumNights?: boolean; applyCheckRules?: boolean }) => {
    if (!selectionStart || !selectionEnd) {
      toast.error('Selectionnez une periode');
      return false;
    }
    const start = format(selectionStart < selectionEnd ? selectionStart : selectionEnd, 'yyyy-MM-dd');
    const end = format(selectionStart < selectionEnd ? selectionEnd : selectionStart, 'yyyy-MM-dd');
    if (pricingScope === 'amicale' && !String(pricingAmicaleId || '').trim()) {
      toast.error('Selectionnez une amicale specifique');
      return false;
    }
    const list = Array.isArray(pricingPeriods) ? pricingPeriods : [];
    const selectedAmicale = String(pricingAmicaleId || '').trim();
    const index = list.findIndex((period) => {
      const scope = String(period.scope || '').trim().toLowerCase() || (String(period.amicale_id || '').trim() ? 'amicale' : 'global');
      const amicale = String(period.amicale_id || '').trim();
      if (String(period.start || '') !== start || String(period.end || '') !== end) return false;
      if (scope !== pricingScope) return false;
      if (scope === 'amicale') return amicale === selectedAmicale;
      return true;
    });
    const current = index >= 0 ? list[index] : null;

    const nightlyPrice = Math.max(0, Number(periodNightlyPrice || defaultNightlyPrice || 0));
    const weeklyPrice = Math.max(0, Number(periodWeeklyPrice || defaultWeeklyPrice || 0));
    if ((options.applyPricing || !current) && nightlyPrice <= 0) {
      toast.error('Prix nuitee requis');
      return false;
    }

    const nextPeriod: SeasonalPricingPeriod = {
      id: current?.id || `pp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      start,
      end,
      prix_nuitee: options.applyPricing || !current ? nightlyPrice : Number(current?.prix_nuitee || nightlyPrice),
      prix_semaine: options.applyPricing || !current
        ? (weeklyPrice > 0 ? weeklyPrice : null)
        : (current?.prix_semaine ?? null),
      minimum_nuitees: options.applyMinimumNights
        ? Math.max(1, Math.floor(Number(periodMinimumNights || 1)))
        : Math.max(1, Number(current?.minimum_nuitees || 1)),
      checkin_jour: options.applyCheckRules ? (periodCheckinDay || null) : (current?.checkin_jour || null),
      checkout_jour: options.applyCheckRules ? (periodCheckoutDay || null) : (current?.checkout_jour || null),
      scope: (current?.scope as 'global' | 'amicales' | 'amicale' | undefined) ?? pricingScope,
      amicale_id: ((current?.scope || pricingScope) === 'amicale')
        ? (current?.amicale_id ?? (pricingAmicaleId || null))
        : null,
    };

    if (index >= 0) {
      const copy = [...list];
      copy[index] = nextPeriod;
      onPricingPeriodsChange(copy);
    } else {
      onPricingPeriodsChange([...list, nextPeriod]);
    }
    return true;
  };

  const handleConfirmMinimumNightsRule = () => {
    const ok = upsertPricingPeriodForSelection({ applyMinimumNights: true });
    if (ok) toast.success('Regle minimum nuitees enregistree pour la periode');
  };

  const handleConfirmCheckinCheckoutRule = () => {
    const ok = upsertPricingPeriodForSelection({ applyCheckRules: true });
    if (ok) toast.success('Regle check-in / check-out enregistree pour la periode');
  };

  const handleRemovePricingPeriod = (index: number) => {
    onPricingPeriodsChange(pricingPeriods.filter((_, i) => i !== index));
    toast.success('Periode tarifaire supprimee');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <h3 className="text-lg font-semibold mb-4"><CalendarIcon className="h-5 w-5 inline text-emerald-600 mr-2" />Calendrier</h3>
      <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-8">
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut calendrier</label>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as 'blocked' | 'booked' | 'pending')} className="w-full rounded-lg border-gray-300 border p-2">
              <option value="blocked">Bloque</option>
              <option value="booked">Reserve</option>
              <option value="pending">En attente</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prix nuitee periode (DT)</label>
            <input type="number" min={0} step="0.01" value={periodNightlyPrice} onChange={(e) => setPeriodNightlyPrice(Number(e.target.value || 0))} className="w-full rounded-lg border-gray-300 border p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prix semaine periode (DT)</label>
            <input type="number" min={0} step="0.01" value={periodWeeklyPrice} onChange={(e) => setPeriodWeeklyPrice(Number(e.target.value || 0))} className="w-full rounded-lg border-gray-300 border p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Minimum nuitees periode</label>
            <input type="number" min={1} step={1} value={periodMinimumNights} onChange={(e) => setPeriodMinimumNights(Math.max(1, Math.floor(Number(e.target.value || 1))))} className="w-full rounded-lg border-gray-300 border p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Jour check-in</label>
            <select value={periodCheckinDay} onChange={(e) => setPeriodCheckinDay(e.target.value)} className="w-full rounded-lg border-gray-300 border p-2 text-sm">
              <option value="">Aucune regle</option>
              {weekdayOptions.map((day) => (
                <option key={day.value} value={day.value}>{day.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Jour check-out</label>
            <select value={periodCheckoutDay} onChange={(e) => setPeriodCheckoutDay(e.target.value)} className="w-full rounded-lg border-gray-300 border p-2 text-sm">
              <option value="">Aucune regle</option>
              {weekdayOptions.map((day) => (
                <option key={day.value} value={day.value}>{day.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Portee tarifaire</label>
            <select
              value={pricingScope}
              onChange={(e) => setPricingScope(e.target.value as 'global' | 'amicales' | 'amicale')}
              className="w-full rounded-lg border-gray-300 border p-2 text-sm"
            >
              <option value="global">Global (tous clients)</option>
              <option value="amicales">Toutes les amicales</option>
              <option value="amicale">Amicale specifique</option>
            </select>
          </div>
          {pricingScope === 'amicale' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Amicale specifique</label>
              <select
                value={pricingAmicaleId}
                onChange={(e) => setPricingAmicaleId(e.target.value)}
                className="w-full rounded-lg border-gray-300 border p-2 text-sm"
              >
                <option value="">Selectionner une amicale</option>
                {amicaleOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="text-xs text-gray-600 rounded-lg border border-gray-200 bg-white p-3 sm:col-span-2">
            <p>Base actuelle:</p>
            <p>Nuit: <span className="font-semibold text-gray-900">{Math.max(0, Number(defaultNightlyPrice || 0))} DT</span></p>
            <p>Semaine: <span className="font-semibold text-gray-900">{Math.max(0, Number(defaultWeeklyPrice || 0))} DT</span></p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">Selection calendrier: {selectionStart ? format(selectionStart, 'dd/MM/yyyy') : '...'}{selectionEnd ? ` - ${format(selectionEnd, 'dd/MM/yyyy')}` : ''}</span>
          <button type="button" onClick={handleAddPeriod} disabled={!selectionStart || !selectionEnd} className="ml-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium">Ajouter indisponibilite</button>
          <button type="button" onClick={handleConfirmMinimumNightsRule} disabled={!selectionStart || !selectionEnd} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium">Confirmer min nuitees</button>
          <button type="button" onClick={handleConfirmCheckinCheckoutRule} disabled={!selectionStart || !selectionEnd} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium">Confirmer check-in/out</button>
          <button type="button" onClick={handleAddPricingFromSelection} disabled={!selectionStart || !selectionEnd} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium">Ajouter tarif periode</button>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4"><button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="h-5 w-5" /></button><h4 className="text-lg font-semibold capitalize">{format(currentMonth, "MMMM yyyy", { locale: fr })}</h4><button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="h-5 w-5" /></button></div>
      <div className="grid grid-cols-7 gap-1 mb-2">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">{day}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">{days.map((day, idx) => <div key={idx} onClick={() => handleDateClick(day)}><div className={getDayClassName(day)} style={{ backgroundColor: getDayBackground(day) || undefined }}><span>{format(day, "d")}</span></div></div>)}</div>
      {dates.length > 0 && <div className="mt-6 pt-4 border-t"><h5 className="font-semibold mb-3">Periodes indisponibles</h5><div className="space-y-2">{dates.map((date, index) => <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><div className="flex items-center gap-3"><div className="w-4 h-4 rounded" style={{ backgroundColor: date.color || '#111827' }}></div><span className="text-sm">{formatDateSafe(date.start)} - {formatDateSafe(date.end)}</span></div><button type="button" onClick={() => handleRemovePeriod(index)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button></div>)}</div></div>}
      {pricingPeriods.length > 0 && <div className="mt-6 pt-4 border-t"><h5 className="font-semibold mb-3">Periodes tarifaires</h5><div className="space-y-2">{pricingPeriods.map((period, index) => <div key={period.id || `${period.start}-${period.end}-${index}`} className="flex items-center justify-between p-3 bg-sky-50 rounded-lg border border-sky-100"><div className="space-y-1"><p className="text-sm font-medium text-gray-900">{formatDateSafe(period.start)} - {formatDateSafe(period.end)}</p><p className="text-xs text-gray-600">Portee: <span className="font-semibold text-gray-900">{resolvePricingScopeLabel(period)}</span></p><p className="text-xs text-gray-600">Nuit: <span className="font-semibold text-gray-900">{Number(period.prix_nuitee || 0)} DT</span> | Semaine: <span className="font-semibold text-gray-900">{Number(period.prix_semaine || 0)} DT</span></p><p className="text-xs text-gray-600">Minimum sejour: <span className="font-semibold text-gray-900">{Math.max(1, Number(period.minimum_nuitees || 1))} nuit(s)</span></p><p className="text-xs text-gray-600">Check-in: <span className="font-semibold text-gray-900">{period.checkin_jour || 'Libre'}</span> | Check-out: <span className="font-semibold text-gray-900">{period.checkout_jour || 'Libre'}</span></p></div><button type="button" onClick={() => handleRemovePricingPeriod(index)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button></div>)}</div></div>}
    </div>
  );
}
function BienPreview({ bien, zones, onSaveVisibility }: { bien: Bien; zones: Zone[]; onSaveVisibility: (bienId: string, patch: { visible_sur_site: boolean; ui_config: BienUiConfig | null }) => Promise<void>; }) {
  const [draftVisibleSurSite, setDraftVisibleSurSite] = useState(bien.visible_sur_site !== false);
  const [draftUiConfig, setDraftUiConfig] = useState<BienUiConfig>(bien.ui_config || {});
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [featureReloadKey, setFeatureReloadKey] = useState(0);

  useEffect(() => {
    setDraftVisibleSurSite(bien.visible_sur_site !== false);
    setDraftUiConfig(bien.ui_config || {});
  }, [bien]);

  const persistVisibility = async (nextVisibleSurSite: boolean, nextUiConfig: BienUiConfig, key: string) => {
    setTogglingKey(key);
    try {
      await onSaveVisibility(bien.id, { visible_sur_site: nextVisibleSurSite, ui_config: nextUiConfig });
    } finally {
      setTogglingKey(null);
    }
  };

  const handleToggleVisibility = async (type: 'section' | 'terrain_tab', key: string, nextValue: boolean) => {
    if (type === 'section') {
      const nextUiConfig = { ...draftUiConfig, [key]: nextValue } as BienUiConfig;
      setDraftUiConfig(nextUiConfig);
      await persistVisibility(draftVisibleSurSite, nextUiConfig, `${type}:${key}`);
      return;
    }
    const nextUiConfig = {
      ...draftUiConfig,
      terrain_tabs: {
        ...(draftUiConfig.terrain_tabs || {}),
        [key]: nextValue,
      },
    };
    setDraftUiConfig(nextUiConfig);
    await persistVisibility(draftVisibleSurSite, nextUiConfig, `${type}:${key}`);
  };

  const handleToggleFeatureVisibility = async (
    feature: { id: string; nom: string; onglet_id?: string | null; type_caracteristique?: string | null; unite?: string | null },
    nextValue: boolean,
  ) => {
    const requestKey = `feature:${feature.id}`;
    setTogglingKey(requestKey);
    try {
      const payload = {
        mode_bien: bien.mode,
        type_bien: bien.type,
        bien_id: bien.id,
        nom: feature.nom,
        type_caracteristique: normalizeFeatureType(feature.type_caracteristique),
        unite: feature.type_caracteristique === 'valeur' ? (feature.unite || '') : '',
        onglet_id: feature.onglet_id || '',
        visibilite_client: nextValue ? 1 : 0,
      };
      const base = String(API_URL || '').replace(/\/+$/, '');
      const normalizedBase = base.replace(/\/api$/i, '');
      const urls = Array.from(new Set([
        `${base}/caracteristiques/${encodeURIComponent(feature.id)}`,
        `${normalizedBase}/api/caracteristiques/${encodeURIComponent(feature.id)}`,
      ]));
      let response: Response | null = null;
      for (const url of urls) {
        const next = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        response = next;
        if (next.ok || next.status !== 404) break;
      }
      const data = response && response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : null;
      if (!response?.ok) {
        throw new Error(data?.error || 'Erreur mise a jour caracteristique');
      }
      setFeatureReloadKey((prev) => prev + 1);
      toast.success('Visibilite caracteristique mise a jour');
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(message ? `Erreur caracteristique: ${message}` : 'Erreur caracteristique');
      throw error;
    } finally {
      setTogglingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                Apercu client
              </div>
              <h3 className="text-base font-semibold text-gray-900">Visibilite du bien</h3>
              <p className="text-xs text-gray-500">Les blocs se pilotent directement dans la page ci-dessous.</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span className="rounded-full bg-white border border-gray-200 px-2.5 py-1">
                  Mode: {modeLabels[(bien.mode || 'location_saisonniere') as BienMode] || bien.mode}
                </span>
                <span className="rounded-full bg-white border border-gray-200 px-2.5 py-1">
                  Type: {typeLabels[normalizeLegacyType((bien.type || 'appartement') as BienType)] || bien.type}
                </span>
                <span className={`rounded-full border px-2.5 py-1 font-semibold ${draftVisibleSurSite ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-gray-300 bg-gray-100 text-gray-700'}`}>
                  {draftVisibleSurSite ? 'Visible' : 'Masque'}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
              <span className="text-sm font-medium text-gray-700">Visible sur le site</span>
              <input
                type="checkbox"
                checked={draftVisibleSurSite}
                onChange={async (e) => {
                  const next = e.target.checked;
                  setDraftVisibleSurSite(next);
                  await persistVisibility(next, draftUiConfig, 'site_visibility');
                }}
                className="h-4 w-4 rounded border-gray-300 text-emerald-600"
              />
            </label>
          </div>
        </div>
      </div>
      {bien.mode === 'vente' ? (
        <PublicBienPageView
          bien={{ ...bien, visible_sur_site: draftVisibleSurSite, ui_config: draftUiConfig }}
          zones={zones}
          backHref={null}
          previewMode
          onToggleVisibility={handleToggleVisibility}
          onToggleFeatureVisibility={handleToggleFeatureVisibility}
          togglingKey={togglingKey}
          featureReloadKey={featureReloadKey}
        />
      ) : (
        <LocationPublicBienPageView
          bien={{ ...bien, visible_sur_site: draftVisibleSurSite, ui_config: draftUiConfig }}
          zones={zones}
          previewMode
          onToggleVisibility={handleToggleVisibility}
          onToggleFeatureVisibility={handleToggleFeatureVisibility}
          togglingKey={togglingKey}
          featureReloadKey={featureReloadKey}
        />
      )}
    </div>
  );
}






