import type { FormikProps } from 'formik';

type DateRangeFormik<Values> = Pick<
  FormikProps<Values>,
  'values' | 'errors' | 'touched' | 'submitCount' | 'setValues' | 'setTouched'
>;

/**
 * Wires a form's start, due and end date fields (YYYY-MM-DD strings, given in
 * that order) to `DatePickerField`. Picking a date clears any other date it
 * puts out of order (clearing a date leaves the others as they are) and marks
 * the changed fields touched so their messages show.
 */
export function useDateRangeFields<
  Values extends Record<Name, string>,
  Name extends keyof Values & string,
>(formik: DateRangeFormik<Values>, order: readonly [Name, Name, Name]) {
  const { values } = formik;

  const pickDate = (name: Name, value: string) => {
    const index = order.indexOf(name);
    const next: Partial<Record<Name, string>> = {};
    next[name] = value;
    // A cleared date can't put another out of order, so only a picked date
    // clears the dates around it.
    if (value) {
      order.forEach((other, otherIndex) => {
        const current = values[other];
        const isOutOfOrder =
          otherIndex < index ? current > value : current < value;
        if (other !== name && current && isOutOfOrder) next[other] = '';
      });
    }

    const touched = { ...formik.touched };
    for (const changed of Object.keys(next) as Name[]) {
      touched[changed] = true as (typeof touched)[Name];
    }
    void formik.setTouched(touched, false);
    void formik.setValues({ ...values, ...next });
  };

  const errorFor = (name: Name) => {
    const error = formik.errors[name];
    return (formik.touched[name] || formik.submitCount > 0) &&
      typeof error === 'string'
      ? error
      : undefined;
  };

  /** The `DatePickerField` props that come from the form for one date field. */
  const dateFieldProps = (name: Name) => ({
    name,
    value: values[name],
    error: errorFor(name),
    onChange: (value: string) => pickDate(name, value),
  });

  return { dateFieldProps };
}
