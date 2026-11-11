import type { DoctorApplicationDraft, SubmittedDoctorApplication } from './types';
import { supabase } from './supabase';

type SubmissionRow = {
  application_id: string;
  reference_code: string;
  submitted_at: string;
};

export async function createDoctorApplication(application: DoctorApplicationDraft): Promise<SubmittedDoctorApplication> {
  const { data, error } = await supabase.rpc('submit_doctor_application', {
    p_mobile_number: application.mobileNumber || null,
    p_full_name: application.fullName.trim(),
    p_age: Number(application.age),
    p_specialisations: application.specialisations,
    p_aadhaar_number: application.aadhaarNumber,
    p_pan_number: application.panNumber.toUpperCase(),
    p_degree_document_provided: application.documents.degree,
    p_aadhaar_document_provided: application.documents.aadhaar,
    p_pan_document_provided: application.documents.pan,
    p_consent_accepted: application.consentAccepted,
  });

  if (error) {
    throw new Error(error.message || 'The application could not be submitted. Please try again.');
  }

  const row = (data as SubmissionRow[] | null)?.[0];
  if (!row) throw new Error('The application was received, but no reference number was returned.');

  return {
    id: row.application_id,
    referenceCode: row.reference_code,
    submittedAt: row.submitted_at,
  };
}
