// Perhitungan gaji murni (tanpa I/O). Uang = string desimal di batas modul, decimal.js di dalam.
export { calculateAttendanceDeduction, type AttendanceDeductionInput, type AttendanceDeductionSalary } from "./attendance-deduction.js";
export {
  calculatePayroll,
  PayrollInputError,
  type PayrollAttendanceInput,
  type PayrollBpjsSettings,
  type PayrollCalculationInput,
} from "./payroll-calculation.js";
export { calculatePph21, pph21IncomeFromPayroll, takeHomePay, type Pph21CurrentPeriod, type Pph21Input } from "./pph21.js";
