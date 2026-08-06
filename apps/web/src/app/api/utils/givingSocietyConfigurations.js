import sql from "@/app/api/utils/sql";
import {
  getDefaultGivingSocietyConfigurations,
  getGivingSocietyConfigurationSignature,
  normalizeGivingSocietyConfiguration,
  normalizeGivingSocietyConfigurations,
  slugifyGivingSocietyKey,
} from "./givingSocietyDefinitions.js";

export {
  getDefaultGivingSocietyConfigurations,
  getGivingSocietyConfigurationSignature,
  normalizeGivingSocietyConfiguration,
  normalizeGivingSocietyConfigurations,
  slugifyGivingSocietyKey,
};

function mapRow(row, index) {
  return normalizeGivingSocietyConfiguration(
    {
      key: row.key,
      name: row.name,
      basis: row.basis,
      periodBasis: row.period_basis,
      fiscalYearStartMonth: row.fiscal_year_start_month,
      minimumAmount: row.minimum_amount,
      maximumAmount: row.maximum_amount,
      countSources: row.count_sources,
      active: row.active,
      displayOrder: row.display_order,
    },
    index,
  );
}

export async function listGivingSocietyConfigurations(sqlClient = sql) {
  const rows = await sqlClient`
    SELECT
      key,
      name,
      basis,
      period_basis,
      fiscal_year_start_month,
      minimum_amount,
      maximum_amount,
      count_sources,
      active,
      display_order,
      updated_at
    FROM giving_society_configurations
    ORDER BY display_order ASC, name ASC
  `;

  if (!rows.length) {
    return getDefaultGivingSocietyConfigurations();
  }

  return rows.map(mapRow);
}

export async function saveGivingSocietyConfigurations({
  definitions,
  userId,
  sqlClient = sql,
}) {
  const normalized = normalizeGivingSocietyConfigurations(definitions).map(
    (definition, index) => ({
      ...definition,
      key:
        definition.key ||
        slugifyGivingSocietyKey(definition.name, `giving_society_${index + 1}`),
      displayOrder: index + 1,
    }),
  );

  for (const definition of normalized) {
    await sqlClient`
      INSERT INTO giving_society_configurations (
        key,
        name,
        basis,
        period_basis,
        fiscal_year_start_month,
        minimum_amount,
        maximum_amount,
        count_sources,
        active,
        display_order,
        created_by,
        updated_by,
        updated_at
      ) VALUES (
        ${definition.key},
        ${definition.name},
        ${definition.basis},
        ${definition.periodBasis},
        ${definition.fiscalYearStartMonth},
        ${definition.minimumAmount},
        ${definition.maximumAmount},
        ${JSON.stringify(definition.countSources)}::jsonb,
        ${definition.active},
        ${definition.displayOrder},
        ${userId || null},
        ${userId || null},
        NOW()
      )
      ON CONFLICT (key) DO UPDATE
      SET
        name = EXCLUDED.name,
        basis = EXCLUDED.basis,
        period_basis = EXCLUDED.period_basis,
        fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
        minimum_amount = EXCLUDED.minimum_amount,
        maximum_amount = EXCLUDED.maximum_amount,
        count_sources = EXCLUDED.count_sources,
        active = EXCLUDED.active,
        display_order = EXCLUDED.display_order,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `;
  }

  return normalized;
}
