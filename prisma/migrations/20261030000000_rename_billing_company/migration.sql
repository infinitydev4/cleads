-- The CRM needs the name "Company" for prospects. The agency's own legal entity (quotes, invoices, RIB) keeps
-- all its data under a new name. Invoices must be kept for years: nothing is dropped here.
ALTER TABLE "Company" RENAME TO "BillingCompany";
ALTER TABLE "BillingCompany" RENAME CONSTRAINT "Company_pkey" TO "BillingCompany_pkey";
ALTER TABLE "BillingCompany" RENAME CONSTRAINT "Company_userId_fkey" TO "BillingCompany_userId_fkey";
