DO $$
DECLARE
  row_record RECORD;
  property_name TEXT;
  property_value JSONB;
  next_properties JSONB;
BEGIN
  FOR row_record IN SELECT canvas_id, id, properties FROM canvas_elements LOOP
    next_properties := row_record.properties;
    FOREACH property_name IN ARRAY ARRAY[
      'fontWeight',
      'fontStyle',
      'textDecoration',
      'textAlign',
      'textVerticalAlign',
      'objectFit',
      'objectPosition'
    ] LOOP
      property_value := next_properties -> property_name;
      IF jsonb_typeof(property_value) = 'object' AND property_value ->> 'kind' = 'variable' THEN
        IF property_value ? 'fallback' THEN
          next_properties := jsonb_set(next_properties, ARRAY[property_name], property_value -> 'fallback', true);
        ELSE
          next_properties := next_properties - property_name;
        END IF;
      END IF;
    END LOOP;

    IF next_properties IS DISTINCT FROM row_record.properties THEN
      UPDATE canvas_elements
      SET properties = next_properties, updated_at = now()
      WHERE canvas_id = row_record.canvas_id AND id = row_record.id;
    END IF;
  END LOOP;
END $$;
