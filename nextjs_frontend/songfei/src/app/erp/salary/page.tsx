/**
 * Route wrapper for the payroll/salary workspace.
 *
 * The real implementation lives in the payroll feature module so it can be
 * reused and kept separate from route wiring concerns.
 */
import SalaryStudio from '@/features/payroll/SalaryStudio';

/** Mounts the Salary Studio feature for the /erp/salary route. */
export default function SalaryPage() {
  return <SalaryStudio />;
}