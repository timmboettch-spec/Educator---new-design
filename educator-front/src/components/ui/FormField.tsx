type FormFieldProps = {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
};

const FormField = ({ label, required, error, children }: FormFieldProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {children}

      {error && <p className="text-[10px] h-3 mt-0.5 text-red-500">{error}</p>}
    </div>
  );
};

export default FormField;
