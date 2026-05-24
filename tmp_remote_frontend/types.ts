export type UserRole = 'admin' | 'user';

export interface Utilisateur {
  id: string;
  nom: string;
  email: string;
  role: UserRole;
  avatar?: string;
  client_type?: 'proprietaire' | 'locataire' | 'acheteur' | 'agent_amicale' | null;
  telephone?: string | null;
  cin?: string | null;
  cin_image_url?: string | null;
  auth_provider?: 'local' | 'google' | 'facebook' | 'phone' | 'email' | 'passkey';
  provider_user_id?: string | null;
  last_login_at?: string | null;
  profile_completed_at?: string | null;
  updated_at?: string | null;
  created_at: string;
}

export type ClienteleGlobalStatus = 'prospect' | 'actif' | 'inactif' | 'blackliste';
export type CanalEntree = 'facebook' | 'site_web' | 'whatsapp' | 'visite_agence' | 'recommandation' | 'google' | 'autre';
export type ClienteleLocataireStatus = 'prospect' | 'verification' | 'actif' | 'incident' | 'archive' | 'blackliste';
export type ClienteleAcheteurStatus = 'lead_brut' | 'qualifie' | 'recherche' | 'visite_planifiee' | 'offre_en_cours' | 'compromis_signe' | 'vendu' | 'perdu';
export type ClienteleProprietaireStatus = 'prospect' | 'mandat_location' | 'mandat_vente' | 'actif' | 'inactif' | 'blackliste';
export type ClientelePenaltyMode = 'jour' | 'mois';
export type ClienteleAcheteurNextAction = 'rappeler' | 'envoyer_offres' | 'programmer_visite';
export type ClienteleMandatType = 'gestion_locative' | 'vente';
export type ClienteleReversementFrequence = 'mensuel' | 'trimestriel';
export type ClienteleProprietaireModePaiement = 'virement' | 'especes' | 'cheque';

export interface ClienteleProfile {
  id: string;
  sourceTable: 'utilisateurs' | 'locataires' | 'proprietaires';
  sourceId: string;
  linkedUserId?: string | null;
  email?: string;
  globalStatus: ClienteleGlobalStatus;
  scoreOverride?: number | null;
  canalEntree?: CanalEntree | null;
  lastInteractionAt?: string | null;
  lastInteractionNote?: string;
  activeRoles: Array<'locataire' | 'acheteur' | 'proprietaire'>;
  vip: boolean;
  blacklistReason?: string;
  locataireStatus?: ClienteleLocataireStatus | null;
  locCinValidee?: boolean;
  locContratSigne?: boolean;
  locDepotEncaisse?: boolean;
  locJustificatifRevenus?: boolean;
  locAttestationTravail?: boolean;
  locNbPersonnes?: number | null;
  locJourEcheance?: number | null;
  locPenaliteMode?: ClientelePenaltyMode | null;
  locPenaliteValeur?: number | null;
  saisonMinNuits?: number | null;
  saisonMaxNuits?: number | null;
  saisonCapaciteMax?: number | null;
  saisonJoursArrivee?: string[];
  saisonJoursDepart?: string[];
  saisonAcomptePourcentage?: number | null;
  saisonDocumentsRecus?: boolean;
  saisonDepotBloque?: boolean;
  saisonDepotRetenuMontant?: number | null;
  saisonDepotRetenuMotif?: string;
  acheteurStatus?: ClienteleAcheteurStatus | null;
  acheteurZones?: string[];
  acheteurTypes?: string[];
  acheteurBudgetMin?: number | null;
  acheteurBudgetMax?: number | null;
  acheteurSurfaceMin?: number | null;
  acheteurDistancePlageMax?: number | null;
  acheteurFinancementMode?: string;
  acheteurNextAction?: ClienteleAcheteurNextAction | null;
  acheteurActionDueAt?: string | null;
  proprietaireStatus?: ClienteleProprietaireStatus | null;
  proprietaireMandatType?: ClienteleMandatType | null;
  proprietaireMandatStart?: string | null;
  proprietaireMandatEnd?: string | null;
  proprietaireReversementFrequence?: ClienteleReversementFrequence | null;
  proprietaireModePaiement?: ClienteleProprietaireModePaiement | null;
  proprietaireCommissionPercent?: number | null;
  proprietairePlafondTravaux?: number | null;
  proprietaireLastStatementAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Zone {
  id: string;
  nom: string;
  description: string;
  pays?: string | null;
  gouvernerat?: string | null;
  region?: string | null;
  quartier?: string | null;
  google_maps_url?: string;
  image_url?: string | null;
  pays_image_url?: string | null;
  gouvernerat_image_url?: string | null;
  region_image_url?: string | null;
  quartier_image_url?: string | null;
}

export interface Proprietaire {
  id: string;
  nom: string;
  telephone: string;
  email: string;
  cin: string;
}

export type BienMode = 'vente' | 'location_annuelle' | 'location_saisonniere';
export type BienType =
  | 'appartement'
  | 'villa_maison'
  | 'studio'
  | 'immeuble'
  | 'terrain'
  | 'lotissement'
  | 'local_commercial'
  | 'bungalow'
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'villa'
  | 'local';
export type BienStatut = 'disponible' | 'loue' | 'reserve' | 'maintenance' | 'bloque';
export type TypeRueAppartementVente = 'piste' | 'route_goudronnee' | 'rue_residentielle';
export type TypePapierAppartementVente =
  | 'titre_foncier_individuel'
  | 'titre_foncier_collectif'
  | 'contrat_seulement'
  | 'sans_papier';
export type TypeTerrainVente = 'agricole' | 'habitation' | 'industrielle' | 'loisir';
export type ModeAffichagePrixTerrain = 'total_uniquement' | 'm2_uniquement' | 'total_et_m2';
export type ModePrixLotissement = 'm2_unique' | 'paliers';
export type TarificationMethodeVente = 'avec_commission' | 'sans_commission';
export type ModalitePaiementVente = 'comptant' | 'facilite';
export type TerrainTopographie = 'plat' | 'en_pente';
export type TerrainVoisinage = 'residentiel_calme' | 'touristique_anime' | 'agricole';
export type TerrainNiveauSonore = 'faible' | 'moyen' | 'eleve';
export type TerrainViabilisationOnas = 'disponible' | 'en_facade' | 'non_disponible';
export type TerrainViabilisationSteg = 'disponible' | 'a_proximite' | 'transformateur_proche' | 'non_disponible';
export type TerrainTypeSol = 'sablonneux' | 'rocheux' | 'terre_agricole';

export interface DateStatus {
  id?: string;
  start: string;
  end: string;
  status: 'blocked' | 'pending' | 'booked';
  color?: string;
  paymentDeadline?: string;
  reservationDemandId?: string | null;
}

export interface SeasonalPricingPeriod {
  id?: string;
  start: string;
  end: string;
  prix_nuitee: number;
  prix_semaine?: number | null;
  minimum_nuitees?: number | null;
  checkin_jour?: 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche' | null;
  checkout_jour?: 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche' | null;
  scope?: 'global' | 'amicales' | 'amicale';
  amicale_id?: string | null;
}

export interface ImmeubleAppartementDetail {
  index: number;
  reference?: string | null;
  chambres: number;
  salle_bain: number;
  superficie_m2?: number | null;
  configuration?: string | null;
}

export interface ImmeubleGarageDetail {
  index: number;
  reference?: string | null;
}

export interface ImmeubleLocalCommercialDetail {
  index: number;
  reference?: string | null;
}

export interface LotissementTerrainDetail {
  index: number;
  reference?: string | null;
  type_terrain?: TypeTerrainVente | null;
  surface_m2?: number | null;
  type_rue?: TypeRueAppartementVente | null;
  type_papier?: TypePapierAppartementVente | null;
  terrain_zone?: string | null;
  terrain_distance_plage_m?: number | null;
  terrain_constructible?: boolean;
  terrain_angle?: boolean;
}

export interface LotissementPalierPrix {
  min_m2: number;
  max_m2?: number | null;
  prix_m2: number;
}

export interface BienUiConfig {
  show_gallery?: boolean;
  show_informations_generales?: boolean;
  show_caracteristiques?: boolean;
  show_tarification_publique?: boolean;
  show_modalites_paiement?: boolean;
  show_localisation?: boolean;
  show_disponibilites?: boolean;
  show_booking_card?: boolean;
  show_immeuble_appartements?: boolean;
  show_immeuble_garages?: boolean;
  show_immeuble_locaux_commerciaux?: boolean;
  show_lotissement_terrains?: boolean;
  terrain_tabs?: Record<string, boolean>;
}

export type CategorieStanding = 'economique' | 'confort' | 'premium' | 'luxe';
export type EtageAppartement = 'rdc' | '1' | '2' | '3' | '4' | '5_plus';
export type VueAppartement = 'mer' | 'jardin' | 'ville' | 'montagne' | 'sans_vue';
export type NiveauSonoreAppartement = 'tres_calme' | 'calme' | 'moyen' | 'bruyant';
export type AccesGeneralAppartement = 'tres_facile' | 'facile' | 'moyen' | 'difficile';
export type PolitiqueAnnulation = 'flexible' | 'moderee' | 'stricte' | 'non_remboursable';
export type TypeCaution = 'cash' | 'preautorisation' | 'virement' | 'aucune';
export type RegleFumeurs = 'autorise' | 'interdit' | 'balcon_terrasse';
export type RegleAnimaux = 'autorises' | 'interdits' | 'sous_conditions';
export type ServicePayantTarification = 'fixe' | 'sur_demande' | 'a_partir_de';

export type ServicePayantBien = {
  id: string;
  categorie?: string;
  label: string;
  description_courte?: string;
  prix_affiche?: string;
  prix: number;
  type_tarification?: ServicePayantTarification;
  enabled: boolean;
};
export type LocationSaisonniereConfig = {
  nom_bien_mobile?: string | null;
  categorie_standing?: CategorieStanding | null;
  etage?: EtageAppartement | null;
  ascenseur?: boolean;
  vue?: VueAppartement | null;
  niveau_sonore?: NiveauSonoreAppartement | null;
  acces_general?: AccesGeneralAppartement | null;
  limite_personnes_nuit?: number | null;
  max_adultes?: number | null;
  max_enfants?: number | null;
  duree_min_sejour_nuits?: number | null;
  duree_max_sejour_nuits?: number | null;
  politique_annulation?: PolitiqueAnnulation | null;
  depot_garantie?: boolean;
  montant_caution?: number | null;
  type_caution?: TypeCaution | null;
  checkin_heure?: string | null;
  checkout_heure?: string | null;
  fumeurs?: RegleFumeurs | null;
  alcool?: 'autorise' | 'interdit' | null;
  fetes?: 'autorise' | 'interdit' | null;
  heures_silence?: string | null;
  animaux?: RegleAnimaux | null;
  produits_accueil_gratuits?: boolean;
  frais_produits_accueil?: number | null;
  matelas_supplementaire_prix?: number | null;
  matelas_supplementaires_max?: number | null;
  avance_pourcentage?: number | null;
  frais_menage_disponible?: boolean;
  frais_menage?: number | null;
  frais_service_disponible?: boolean;
  frais_service?: number | null;
  services_payants?: ServicePayantBien[];
  google_maps_embed_url?: string | null;
  exterieur_jardin?: string[];
  confort_equipements_interieurs?: string[];
  climatisation?: boolean;
  terrasse?: boolean;
  vue_mer?: boolean;
  proche_plage?: boolean;
  distance_plage_m?: number | null;
};

export interface Bien {
  id: string;
  reference: string;
  titre: string;
  nom_bien_mobile?: string | null;
  description?: string;
  mode: BienMode;
  type: BienType;
  surface?: number;
  nb_chambres: number;
  nb_salle_bain: number;
  prix_nuitee: number;
  prix_semaine?: number | null;
  tarification_methode?: TarificationMethodeVente | null;
  prix_affiche_client?: number | null;
  prix_fixe_proprietaire?: number | null;
  prix_proprietaire?: number | null;
  prix_final?: number | null;
  revenu_agence?: number | null;
  commission_pourcentage_proprietaire?: number | null;
  commission_pourcentage_client?: number | null;
  montant_max_reduction_negociation?: number | null;
  prix_minimum_accepte?: number | null;
  modalite_paiement_vente?: ModalitePaiementVente | null;
  pourcentage_premiere_partie_promesse?: number | null;
  montant_premiere_partie_promesse?: number | null;
  montant_deuxieme_partie?: number | null;
  nombre_tranches?: number | null;
  periode_tranches_mois?: number | null;
  montant_par_tranche?: number | null;
  avance: number;
  caution: number;
  type_rue?: TypeRueAppartementVente | null;
  type_papier?: TypePapierAppartementVente | null;
  superficie_m2?: number | null;
  etage?: number | null;
  configuration?: string | null;
  annee_construction?: number | null;
  distance_plage_m?: number | null;
  proche_plage?: boolean;
  chauffage_central?: boolean;
  climatisation?: boolean;
  balcon?: boolean;
  terrasse?: boolean;
  ascenseur?: boolean;
  vue_mer?: boolean;
  gaz_ville?: boolean;
  cuisine_equipee?: boolean;
  place_parking?: boolean;
  syndic?: boolean;
  meuble?: boolean;
  independant?: boolean;
  eau_puits?: boolean;
  eau_sonede?: boolean;
  electricite_steg?: boolean;
  surface_local_m2?: number | null;
  facade_m?: number | null;
  hauteur_plafond_m?: number | null;
  activite_recommandee?: string | null;
  toilette?: boolean;
  reserve_local?: boolean;
  vitrine?: boolean;
  coin_angle?: boolean;
  electricite_3_phases?: boolean;
  alarme?: boolean;
  type_terrain?: TypeTerrainVente | null;
  terrain_facade_m?: number | null;
  terrain_surface_m2?: number | null;
  terrain_distance_plage_m?: number | null;
  terrain_zone?: string | null;
  terrain_constructible?: boolean;
  terrain_angle?: boolean;
  terrain_prix_affiche_total?: number | null;
  terrain_prix_affiche_par_m2?: number | null;
  terrain_mode_affichage_prix?: ModeAffichagePrixTerrain | null;
  terrain_disponibilite_reseaux?: string[] | null;
  terrain_hauteur_construction_autorisee?: string | null;
  terrain_route_acces_largeur_m?: number | null;
  terrain_forme?: string | null;
  terrain_topographie?: TerrainTopographie | null;
  terrain_bornage?: boolean;
  terrain_travaux_municipalite_autorises?: boolean;
  terrain_limites_cadastrales?: boolean;
  terrain_visualisation_limites_cadastrales?: boolean;
  terrain_voisinage?: TerrainVoisinage | null;
  terrain_proximites_commodites?: string[] | null;
  terrain_proximites_commodites_autres?: string | null;
  terrain_viabilisation_eau_sources?: string[] | null;
  terrain_viabilisation_onas?: TerrainViabilisationOnas | null;
  terrain_viabilisation_steg?: TerrainViabilisationSteg | null;
  terrain_viabilisation_gaz_ville?: boolean;
  terrain_viabilisation_fibre_optique?: boolean;
  terrain_viabilisation_telephone_fixe?: boolean;
  terrain_type_sol?: TerrainTypeSol | null;
  terrain_vegetation?: string | null;
  terrain_niveau_sonore?: TerrainNiveauSonore | null;
  terrain_risque_inondation?: boolean;
  terrain_exposition_vent?: string | null;
  terrain_ideal_utilisations?: string[] | null;
  terrain_documents_disponibles?: string[] | null;
  immeuble_surface_terrain_m2?: number | null;
  immeuble_surface_batie_m2?: number | null;
  immeuble_nb_niveaux?: number | null;
  immeuble_nb_garages?: number | null;
  immeuble_nb_appartements?: number | null;
  immeuble_nb_locaux_commerciaux?: number | null;
  immeuble_distance_plage_m?: number | null;
  immeuble_proche_plage?: boolean;
  immeuble_ascenseur?: boolean;
  immeuble_parking_sous_sol?: boolean;
  immeuble_parking_exterieur?: boolean;
  immeuble_syndic?: boolean;
  immeuble_vue_mer?: boolean;
  immeuble_appartements?: ImmeubleAppartementDetail[];
  immeuble_garages?: ImmeubleGarageDetail[];
  immeuble_locaux_commerciaux?: ImmeubleLocalCommercialDetail[];
  lotissement_nb_terrains?: number | null;
  lotissement_prix_total?: number | null;
  lotissement_mode_prix_m2?: ModePrixLotissement | null;
  lotissement_prix_m2_unique?: number | null;
  lotissement_terrains?: LotissementTerrainDetail[];
  lotissement_paliers_prix_m2?: LotissementPalierPrix[];
  charges?: number;
  statut: BienStatut;
  visible_sur_site?: boolean;
  is_featured?: boolean;
  ui_config?: BienUiConfig | null;
  location_saisonniere_config?: LocationSaisonniereConfig | null;
  menage_en_cours: boolean;
  zone_id?: string;
  proprietaire_id?: string;
  date_ajout: string;
  created_at: string;
  updated_at: string;
  admin_last_saved_at?: string | null;
  media?: Media[];
  unavailableDates?: DateStatus[];
  pricing_periods?: SeasonalPricingPeriod[];
  caracteristiques?: string[];
  caracteristique_ids?: string[];
  caracteristique_valeurs?: Record<string, string | string[]>;
}

export interface Caracteristique {
  id: string;
  nom: string;
  type_caracteristique?: 'simple' | 'choix_multiple' | 'plusieurs_choix' | 'valeur' | 'texte';
  choix_json?: string | null;
  unite?: string | null;
  icon_name?: string | null;
  onglet_id?: string | null;
  onglet_nom?: string | null;
  visibilite_client?: number | null;
  valeur_json?: string | null;
}

export interface Media {
  id: string;
  bien_id: string;
  type: 'image' | 'video';
  url: string;
  position?: number;
  motif_upload?: string | null;
}

export interface Locataire {
  id: string;
  nom: string;
  telephone: string;
  email: string;
  cin: string;
  score_fiabilite: number;
  created_at: string;
}

export type ContratStatut = 'actif' | 'termine' | 'resilie';

export interface Contrat {
  id: string;
  bien_id: string;
  locataire_id: string;
  date_debut: string;
  date_fin: string;
  montant_recu: number;
  url_pdf?: string;
  owner_url_pdf?: string;
  statut: ContratStatut;
  created_at: string;
}

export type PaiementStatut = 'paye' | 'en_attente' | 'retard';
export type PaiementMethode = 'virement' | 'especes' | 'cheque';

export interface Paiement {
  id: string;
  contrat_id: string;
  montant: number;
  date_paiement: string;
  statut: PaiementStatut;
  methode: PaiementMethode;
}

export type MaintenanceStatut = 'en_attente_accord_proprietaire' | 'approuve' | 'en_cours' | 'termine' | 'annule';

export interface Maintenance {
  id: string;
  bien_id: string;
  description: string;
  cout: number;
  statut: MaintenanceStatut;
  bien_titre?: string;
  proprietaire_id?: string | null;
  proprietaire_nom?: string | null;
  owner_approval_required?: boolean;
  owner_approval_status?: 'non_requis' | 'en_attente' | 'approuve';
  owner_approved_at?: string | null;
  created_at: string;
}

export type ClienteleTaskSeverity = 'info' | 'warning' | 'critical';
export type ClienteleTaskStatus = 'open' | 'done';

export interface ClienteleTask {
  id: string;
  sourceTable: 'utilisateurs' | 'locataires' | 'proprietaires';
  sourceId: string;
  taskType: string;
  severity: ClienteleTaskSeverity;
  title: string;
  detail: string;
  dueDate?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  status: ClienteleTaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  utilisateur_id?: string | null;
  type: 'info' | 'warning' | 'success' | 'error';
  message: string;
  lu: boolean;
  created_at: string;
}

export type ReservationDemandStatus =
  | 'en_attente_reponse_proprietaire'
  | 'pas_de_reponse_proprietaire'
  | 'reponse_positive_attente_confirmation_client'
  | 'client_procede_vers_paiement_en_cours'
  | 'reponse_negative_autre_proposition_meme_bien'
  | 'reponse_negative_autre_proposition_bien_similaire'
  | 'attente_validation_amicale'
  | 'attente_validation_par_agence'
  | 'voucher_en_cours'
  | 'rejete_par_amicale'
  | 'rejete_par_agence'
  | 'demande_rejetee_admin'
  | 'demande_annulee_client'
  | 'demande_annulee_echeance_contrat'
  | 'attente_envoi_coordonnees_contrat'
  | 'demande_recu_paiement'
  | 'recu_paiement_envoye'
  | 'contrat_realise'
  | 'succes_paiement';

export type ReservationDemandRequestType = 'reservation' | 'visite';

export interface ReservationDemand {
  id: string;
  bien_id: string;
  request_type?: ReservationDemandRequestType;
  unavailable_date_id?: string | null;
  client_user_id?: string | null;
  client_email?: string | null;
  client_name?: string | null;
  proprietaire_id?: string | null;
  owner_user_id?: string | null;
  start_date: string;
  end_date: string;
  guests: number;
  adult_guests?: number;
  child_guests?: number;
  payment_mode?: 'avance' | 'totalite' | 'amicale' | null;
  pricing_amicale_id?: string | null;
  amicale_matricule?: string | null;
  amicale_phone?: string | null;
  amicale_code?: string | null;
  total_amount?: number | null;
  amount_due_now?: number | null;
  selected_fixed_services?: ServicePayantBien[];
  selected_variable_services?: ServicePayantBien[];
  variable_services_quote?: Array<ServicePayantBien & { prix_saisi?: number | null }>;
  variable_services_quote_total?: number | null;
  variable_services_quote_status?: 'aucun' | 'a_traiter' | 'devis_envoye' | 'accepte' | 'paye' | null;
  amicale_validation_at?: string | null;
  agency_validation_at?: string | null;
  voucher_id?: string | null;
  voucher_number?: string | null;
  voucher_url?: string | null;
  voucher_generated_at?: string | null;
  reservation_payment_id?: string | null;
  reservation_payment_paid_at?: string | null;
  services_payment_id?: string | null;
  services_payment_paid_at?: string | null;
  flouci_checkout_id?: string | null;
  flouci_scope?: 'reservation' | 'services' | 'combined' | null;
  flouci_status?: string | null;
  flouci_checkout_url?: string | null;
  flouci_verified_at?: string | null;
  payment_receipt_image_url?: string | null;
  payment_receipt_uploaded_at?: string | null;
  payment_receipt_note?: string | null;
  status: ReservationDemandStatus;
  owner_notified_at?: string | null;
  owner_response_at?: string | null;
  client_confirmation_clicked_at?: string | null;
  admin_note?: string | null;
  client_note?: string | null;
  identity_document_type?: 'cin_tn' | 'passport_tn' | 'passport_foreign' | null;
  identity_document_number?: string | null;
  identity_first_name?: string | null;
  identity_last_name?: string | null;
  identity_document_country?: string | null;
  identity_document_image_url?: string | null;
  identity_ocr_text?: string | null;
  identity_submitted_at?: string | null;
  contract_generated_at?: string | null;
  finalization_due_at?: string | null;
  contract_id?: string | null;
  payment_id?: string | null;
  bien_titre?: string | null;
  bien_reference?: string | null;
  proprietaire_nom?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationDemandHistory {
  id: string;
  demand_id: string;
  status: ReservationDemandStatus;
  actor_type: 'client' | 'admin' | 'system' | 'proprietaire' | 'agent_amicale';
  actor_id?: string | null;
  note?: string | null;
  created_at: string;
}
