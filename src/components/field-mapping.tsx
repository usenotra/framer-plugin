import {
  framer,
  type ManagedCollection,
  type ManagedCollectionFieldInput,
  useIsAllowedTo,
} from "framer-plugin";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DataSource,
  dataSourceOptions,
  getDataSource,
  mergeFieldsWithExistingFields,
  PLUGIN_KEYS,
  setStoredAllowDrafts,
  syncCollection,
  syncMethods,
} from "../util/data";

interface FieldMappingRowProps {
  disabled: boolean;
  field: ManagedCollectionFieldInput;
  isIgnored: boolean;
  onNameChange: (fieldId: string, name: string) => void;
  onToggleDisabled: (fieldId: string) => void;
  originalFieldName: string | undefined;
}

function FieldMappingRow({
  field,
  originalFieldName,
  isIgnored,
  onToggleDisabled,
  onNameChange,
  disabled,
}: FieldMappingRowProps) {
  return (
    <>
      <button
        className={`source-field ${isIgnored ? "ignored" : ""}`}
        disabled={disabled}
        onClick={() => onToggleDisabled(field.id)}
        type="button"
      >
        <input checked={!isIgnored} readOnly tabIndex={-1} type="checkbox" />
        <span>{originalFieldName ?? field.id}</span>
      </button>
      <svg fill="none" height="8" width="8" xmlns="http://www.w3.org/2000/svg">
        <title>maps to</title>
        <path
          d="m2.5 7 3-3-3-3"
          fill="transparent"
          stroke="#999"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
      <input
        disabled={isIgnored || disabled}
        onChange={(event) => onNameChange(field.id, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
          }
        }}
        placeholder={field.id}
        type="text"
        value={field.name}
      />
    </>
  );
}

// Create a const empty array to be used whenever there are no fields.
const emptyFields: ManagedCollectionFieldInput[] = [];
Object.freeze(emptyFields);

const initialFieldIds: ReadonlySet<string> = new Set();

interface FieldMappingProps {
  collection: ManagedCollection;
  dataSource: DataSource;
  initialSlugFieldId: string | null;
}

export function FieldMapping({
  collection,
  dataSource,
  initialSlugFieldId,
}: FieldMappingProps) {
  const [status, setStatus] = useState<
    "mapping-fields" | "loading-fields" | "syncing-collection"
  >(initialSlugFieldId ? "loading-fields" : "mapping-fields");
  const isSyncing = status === "syncing-collection";
  const isLoadingFields = status === "loading-fields";

  const [fields, setFields] =
    useState<ManagedCollectionFieldInput[]>(emptyFields);
  const [ignoredFieldIds, setIgnoredFieldIds] = useState(initialFieldIds);

  const possibleSlugFields = useMemo(
    () =>
      dataSource.fields.filter(
        (field) => field.type === "string" && field.id !== "status"
      ),
    [dataSource.fields]
  );

  const [selectedSlugField, setSelectedSlugField] =
    useState<ManagedCollectionFieldInput | null>(
      possibleSlugFields.find((field) => field.id === initialSlugFieldId) ??
        possibleSlugFields[0] ??
        null
    );
  const [allowDrafts, setAllowDrafts] = useState(false);

  const dataSourceName =
    dataSourceOptions.find((option) => option.id === dataSource.id)?.name ??
    dataSource.id;

  useEffect(() => {
    let cancelled = false;

    collection
      .getPluginData(PLUGIN_KEYS.ALLOW_DRAFTS)
      .then((stored) => {
        if (!cancelled) {
          setAllowDrafts(stored === "true");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to load allow drafts setting", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [collection]);

  useEffect(() => {
    const abortController = new AbortController();

    collection
      .getFields()
      .then((collectionFields) => {
        if (abortController.signal.aborted) {
          return;
        }

        setFields(
          mergeFieldsWithExistingFields(dataSource.fields, collectionFields)
        );

        const existingFieldIds = new Set(
          collectionFields.map((field) => field.id)
        );

        if (initialSlugFieldId) {
          const ignoredIds = new Set<string>();
          for (const sourceField of dataSource.fields) {
            if (existingFieldIds.has(sourceField.id)) {
              continue;
            }
            ignoredIds.add(sourceField.id);
          }
          setIgnoredFieldIds(ignoredIds);
        }

        setStatus("mapping-fields");
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          console.error("Failed to fetch collection fields:", error);
          framer.notify("Failed to load collection fields", {
            variant: "error",
          });
        }
      });

    return () => abortController.abort();
  }, [initialSlugFieldId, dataSource, collection]);

  const changeFieldName = useCallback((fieldId: string, name: string) => {
    setFields((prevFields) => {
      const updatedFields = prevFields.map((field) => {
        if (field.id !== fieldId) {
          return field;
        }
        return { ...field, name };
      });
      return updatedFields;
    });
  }, []);

  const toggleFieldDisabledState = useCallback((fieldId: string) => {
    setIgnoredFieldIds((previousIgnoredFieldIds) => {
      const updatedIgnoredFieldIds = new Set(previousIgnoredFieldIds);

      if (updatedIgnoredFieldIds.has(fieldId)) {
        updatedIgnoredFieldIds.delete(fieldId);
      } else {
        updatedIgnoredFieldIds.add(fieldId);
      }

      return updatedIgnoredFieldIds;
    });
  }, []);

  const isAllowedToManage = useIsAllowedTo(
    "ManagedCollection.setFields",
    ...syncMethods
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedSlugField) {
      // This can't happen because the form will not submit if no slug field is selected
      // but TypeScript can't infer that.
      console.error(
        "There is no slug field selected. Sync will not be performed"
      );
      framer.notify("Please select a slug field before importing.", {
        variant: "warning",
      });
      return;
    }

    try {
      setStatus("syncing-collection");

      await setStoredAllowDrafts(collection, allowDrafts);

      const apiKey = await collection.getPluginData(PLUGIN_KEYS.API_KEY);
      if (!apiKey?.trim()) {
        throw new Error("API key not found");
      }
      const freshDataSource = await getDataSource(
        apiKey,
        dataSource.id,
        undefined,
        allowDrafts
      );

      const fieldsToSync: ManagedCollectionFieldInput[] = [];
      for (const field of fields) {
        if (ignoredFieldIds.has(field.id)) {
          continue;
        }
        fieldsToSync.push({ ...field, name: field.name.trim() || field.id });
      }

      await collection.setFields(fieldsToSync);
      await syncCollection(
        collection,
        freshDataSource,
        fieldsToSync,
        selectedSlugField
      );
      framer.closePlugin("Synchronization successful", { variant: "success" });
    } catch (error) {
      console.error(error);
      framer.notify(
        `Failed to sync collection “${dataSource.id}”. Check the logs for more details.`,
        {
          variant: "error",
        }
      );
    } finally {
      setStatus("mapping-fields");
    }
  };

  if (isLoadingFields) {
    return (
      <main className="loading">
        <div className="framer-spinner" />
      </main>
    );
  }

  return (
    <main className="framer-hide-scrollbar mapping">
      <hr className="sticky-divider" />
      <form onSubmit={handleSubmit}>
        <label className="slug-field" htmlFor="slugField">
          Slug Field
          <select
            className="field-input"
            disabled={!isAllowedToManage}
            name="slugField"
            onChange={(event) => {
              const selectedFieldId = event.target.value;
              const selectedField = possibleSlugFields.find(
                (field) => field.id === selectedFieldId
              );
              if (!selectedField) {
                return;
              }
              setSelectedSlugField(selectedField);
            }}
            required
            value={selectedSlugField ? selectedSlugField.id : ""}
          >
            {possibleSlugFields.map((possibleSlugField) => {
              return (
                <option
                  key={`slug-field-${possibleSlugField.id}`}
                  value={possibleSlugField.id}
                >
                  {possibleSlugField.name}
                </option>
              );
            })}
          </select>
        </label>

        <div className="fields">
          <span className="fields-column">Column</span>
          <span>Field</span>
          {fields.map((field) => (
            <FieldMappingRow
              disabled={!isAllowedToManage}
              field={field}
              isIgnored={ignoredFieldIds.has(field.id)}
              key={`field-${field.id}`}
              onNameChange={changeFieldName}
              onToggleDisabled={toggleFieldDisabledState}
              originalFieldName={
                dataSource.fields.find(
                  (sourceField) => sourceField.id === field.id
                )?.name
              }
            />
          ))}
        </div>

        <footer>
          <hr />
          <label className="mapping-checkbox">
            <input
              checked={allowDrafts}
              disabled={!isAllowedToManage}
              onChange={(event) => setAllowDrafts(event.target.checked)}
              type="checkbox"
            />
            <span>Allow drafts</span>
          </label>
          <p className="mapping-checkbox-hint">
            Include draft posts from Notra in the import. Leave unchecked to
            import only published content.
          </p>
          <button
            disabled={isSyncing || !isAllowedToManage}
            title={isAllowedToManage ? undefined : "Insufficient permissions"}
            type="submit"
          >
            {isSyncing ? (
              <div className="framer-spinner" />
            ) : (
              `Import ${dataSourceName}`
            )}
          </button>
        </footer>
      </form>
    </main>
  );
}
