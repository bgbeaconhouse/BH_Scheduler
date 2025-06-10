// Fixed Date Utility for Consistent Timezone Handling
export class DateUtils {
  
  /**
   * Creates a date from local date and time strings (YYYY-MM-DD and HH:MM)
   * Returns a Date object that represents the local time WITHOUT timezone conversion
   */
  static createLocalDateTime(dateStr: string, timeStr: string): Date {
    // Parse date components
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    
    // Create date in local timezone - this stays as local time
    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    return date;
  }

  /**
   * Formats a Date object to local date string (YYYY-MM-DD)
   */
  static formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formats a Date object to local time string (HH:MM)
   */
  static formatLocalTime(date: Date): string {
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${hour}:${minute}`;
  }

  /**
   * Formats a Date object to display time (e.g., "8:30 AM")
   */
  static formatDisplayTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Formats a Date object to display date (e.g., "Jun 10")
   */
  static formatDisplayDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Gets day name (e.g., "Mon", "Tue")
   */
  static getDayName(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  /**
   * Checks if two dates are the same day (ignoring time)
   */
  static isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Generates an array of dates for a week starting from Monday
   */
  static getWeekDates(startDate: Date): Date[] {
    const dates = [];
    const monday = new Date(startDate);
    
    // Adjust to Monday if not already
    const dayOfWeek = monday.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(monday.getDate() + daysToMonday);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      dates.push(date);
    }
    
    return dates;
  }

  /**
   * Converts a local Date to a format suitable for API storage
   * This preserves the local date/time values without timezone conversion
   */
  static toLocalISOString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    
    // Return in ISO format but without timezone conversion
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }

  /**
   * Parses a date string and returns a local Date
   * Treats the stored time as local time (no timezone conversion)
   */
  static fromLocalISOString(isoString: string): Date {
    // Parse the components manually to avoid timezone issues
    const parts = isoString.replace('Z', '').split('T');
    const datePart = parts[0];
    const timePart = parts[1] || '00:00:00';
    
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);
    
    return new Date(year, month - 1, day, hour, minute, second || 0);
  }

  /**
   * Gets current date/time as local Date
   */
  static now(): Date {
    return new Date();
  }

  /**
   * Gets today's date at start of day
   */
  static today(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
}