import React, { useState, useRef, useEffect } from "react";

interface DatePickerProps {
  value: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
}

export default function DatePicker({
  value,
  onChange,
  disabled = false,
  id,
  "data-testid": dataTestId,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const date = value ? new Date(value + "T00:00:00") : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const monthPickerRef = useRef<HTMLDivElement>(null);
  const yearPickerRef = useRef<HTMLDivElement>(null);
  const yearButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const monthButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const selectedDate = value ? new Date(value + "T00:00:00") : null;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handleDateClick = (day: number) => {
    const newDate = new Date(year, month, day);
    const dateStr = newDate.toISOString().split("T")[0];
    onChange(dateStr);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handlePrevYear = () => {
    setViewDate(new Date(year - 1, month, 1));
  };

  const handleNextYear = () => {
    setViewDate(new Date(year + 1, month, 1));
  };

  const handleMonthSelect = (selectedMonth: number) => {
    setViewDate(new Date(year, selectedMonth, 1));
    setShowMonthPicker(false);
  };

  const handleYearSelect = (selectedYear: number) => {
    setViewDate(new Date(selectedYear, month, 1));
    setShowYearPicker(false);
  };

  const handleToday = () => {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    onChange(dateStr);
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  // Generate year list (current year ± 100 years)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 201 }, (_, i) => currentYear - 100 + i);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!monthPickerRef.current || !monthPickerRef.current.contains(target)) &&
        (!yearPickerRef.current || !yearPickerRef.current.contains(target))
      ) {
        setIsOpen(false);
        setShowMonthPicker(false);
        setShowYearPicker(false);
      }
    };

    if (isOpen || showMonthPicker || showYearPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen, showMonthPicker, showYearPicker]);

  // Scroll to current year when year picker opens
  useEffect(() => {
    if (showYearPicker && yearPickerRef.current) {
      const currentYearButton = yearButtonRefs.current.get(year);
      if (currentYearButton) {
        // Small delay to ensure the dropdown is rendered
        setTimeout(() => {
          currentYearButton.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 10);
      }
    }
  }, [showYearPicker, year]);

  // Scroll to current month when month picker opens
  useEffect(() => {
    if (showMonthPicker && monthPickerRef.current) {
      const currentMonthButton = monthButtonRefs.current.get(month);
      if (currentMonthButton) {
        // Small delay to ensure the dropdown is rendered
        setTimeout(() => {
          currentMonthButton.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 10);
      }
    }
  }, [showMonthPicker, month]);

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const days = [];
  // Empty cells for days before the first day of the month
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null);
  }
  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <input
        id={id}
        data-testid={dataTestId}
        type="text"
        value={formatDisplayDate(value)}
        readOnly
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          padding: "4px 8px",
          fontSize: 13,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          background: disabled ? "var(--surface)" : "var(--bg)",
          color: disabled ? "var(--text-muted)" : "var(--text)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          width: "140px",
        }}
      />
      {isOpen && !disabled && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 4,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 12,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            zIndex: 1000,
            minWidth: 280,
          }}
        >
          {/* Header with month/year navigation */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              onClick={handlePrevMonth}
              style={{
                background: "none",
                border: "none",
                fontSize: 16,
                cursor: "pointer",
                color: "var(--text)",
                padding: "4px 8px",
              }}
              title="Previous month"
            >
              ‹
            </button>
            <div style={{ position: "relative", flex: 1, display: "flex", justifyContent: "center", gap: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setShowMonthPicker(!showMonthPicker);
                  setShowYearPicker(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "var(--text)",
                  padding: "4px 8px",
                  borderRadius: "var(--radius-sm)",
                  transition: "background 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--surface)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {monthNames[month]}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowYearPicker(!showYearPicker);
                  setShowMonthPicker(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "var(--text)",
                  padding: "4px 8px",
                  borderRadius: "var(--radius-sm)",
                  transition: "background 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--surface)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {year}
              </button>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              style={{
                background: "none",
                border: "none",
                fontSize: 16,
                cursor: "pointer",
                color: "var(--text)",
                padding: "4px 8px",
              }}
              title="Next month"
            >
              ›
            </button>
          </div>

          {/* Day names header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 4,
              marginBottom: 8,
            }}
          >
            {dayNames.map((day) => (
              <div
                key={day}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textAlign: "center",
                  padding: "4px 0",
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 4,
            }}
          >
            {days.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} />;
              }

              const cellDate = new Date(year, month, day);
              const isSelected =
                selectedDate &&
                cellDate.getTime() === selectedDate.getTime();
              const isToday =
                cellDate.toDateString() === new Date().toDateString();

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDateClick(day)}
                  style={{
                    background: isSelected
                      ? "var(--primary)"
                      : isToday
                      ? "var(--surface)"
                      : "transparent",
                    border: isToday
                      ? "1px solid var(--primary)"
                      : "1px solid transparent",
                    borderRadius: "var(--radius-sm)",
                    color: isSelected
                      ? "#fff"
                      : isToday
                      ? "var(--primary)"
                      : "var(--text)",
                    fontSize: 13,
                    padding: "6px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = "var(--surface)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background =
                        isToday
                          ? "var(--surface)"
                          : "transparent";
                    }
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Today button */}
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button
              type="button"
              onClick={handleToday}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: 12,
                padding: "4px 12px",
                cursor: "pointer",
              }}
            >
              Today
            </button>
          </div>

          {/* Month picker dropdown */}
          {showMonthPicker && (
            <div
              ref={monthPickerRef}
              style={{
                position: "absolute",
                top: 60,
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: 8,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                zIndex: 1001,
                minWidth: 120,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
          {monthNames.map((monthName, idx) => (
            <button
              key={idx}
              ref={(el) => {
                if (el) {
                  monthButtonRefs.current.set(idx, el);
                } else {
                  monthButtonRefs.current.delete(idx);
                }
              }}
              type="button"
              onClick={() => handleMonthSelect(idx)}
              style={{
                width: "100%",
                background: month === idx ? "var(--primary)" : "transparent",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: month === idx ? "#fff" : "var(--text)",
                fontSize: 13,
                padding: "6px 12px",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (month !== idx) {
                  e.currentTarget.style.background = "var(--surface)";
                }
              }}
              onMouseLeave={(e) => {
                if (month !== idx) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {monthName}
            </button>
          ))}
          </div>
          )}

          {/* Year picker dropdown */}
          {showYearPicker && (
            <div
              ref={yearPickerRef}
              style={{
                position: "absolute",
                top: 60,
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: 8,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                zIndex: 1001,
                minWidth: 100,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
          {years.map((yr) => (
            <button
              key={yr}
              ref={(el) => {
                if (el) {
                  yearButtonRefs.current.set(yr, el);
                } else {
                  yearButtonRefs.current.delete(yr);
                }
              }}
              type="button"
              onClick={() => handleYearSelect(yr)}
              style={{
                width: "100%",
                background: year === yr ? "var(--primary)" : "transparent",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: year === yr ? "#fff" : "var(--text)",
                fontSize: 13,
                padding: "6px 12px",
                cursor: "pointer",
                textAlign: "center",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (year !== yr) {
                  e.currentTarget.style.background = "var(--surface)";
                }
              }}
              onMouseLeave={(e) => {
                if (year !== yr) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {yr}
            </button>
          ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
