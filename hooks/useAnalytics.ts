export const useAnalytics = () => {
  const pushEvent = (event: string, data: Record<string, any>) => {
    if (window.dataLayer) {
      window.dataLayer.push({
        event,
        ...data,
      })
    }
  }

  return {
    trackEvent: (eventName: string, eventData: Record<string, any>) => {
      pushEvent(eventName, eventData)
    },
    trackConversion: (conversionData: {
      value: number
      currency?: string
      transactionId?: string
    }) => {
      pushEvent("conversion", conversionData)
    },
    trackFormSubmission: (formName: string, formData: Record<string, any>) => {
      pushEvent("form_submission", {
        form_name: formName,
        ...formData,
      })
    },
  }
} 